const electron = require('electron');
const base64 = require('base64-arraybuffer');
const kbpgp = require('kbpgp');
const fs = require('fs');
const userHome = require('os').homedir();
const tmp = require('temporary');

const { ipcMain } = electron;

module.exports = {
  initialize,
};

const KEY_STORE = {};
KEY_STORE.myKey = null;
KEY_STORE.contacts = {};

const KEY_RING = new kbpgp.keyring.KeyRing;

let initialized = false;

const DELIMITER = '-';

const PREFIX = 'vsnfd';
const keyWithPrefix = key => [PREFIX, key].join(DELIMITER);


// ipc keys
const ENCRYPTION_REQUEST = keyWithPrefix('encrypt-attachment');
const DECRYPTION_REQUEST = keyWithPrefix('decrypt-attachment');
const ENSURE_KEYPAIR_AVAILABLE = keyWithPrefix('ensure-keypair-available');

const RECEIVED_PUB_KEY = keyWithPrefix('received-pub-key');
const TEST_CONTACT_KEY_AVAILABLE = keyWithPrefix('test-contact-key-available');

function initialize() {
  if (initialized) {
    throw new Error('initialize: Already initialized!');
  }

  initialized = true;

  ipcMain.on(ENCRYPTION_REQUEST, (event, { data, number }) => {
    const binaryData = base64.decode(data);

    const params = {
      msg: binaryData,
      encrypt_for: KEY_STORE.contacts[number],
      sign_with: KEY_STORE.myKey,
    };

    kbpgp.box(params, (err, resultString) => {
      event.returnValue = { data: resultString };
    });
  });

  const USER_DATA_PATH = electron.app.getPath('userData');
  const USER_TMP_PATH = `${USER_DATA_PATH}/tmp`;
  if (!fs.existsSync(USER_TMP_PATH)) {
    fs.mkdirSync(USER_TMP_PATH);
  }

  ipcMain.on(DECRYPTION_REQUEST, (event, { path }) => {
    const armoredEncryptedMessage = fs.readFileSync(path);

    kbpgp.unbox({ keyfetch: KEY_RING, armored: armoredEncryptedMessage }, (err, literals) => {
      if (err) throw err;

      const decryptData = literals[0].toBuffer();

      const superTmpFile = new tmp.File();

      const tmpFilePath = `${USER_DATA_PATH}${superTmpFile.path}`;

      superTmpFile.unlinkSync();

      fs.writeFileSync(tmpFilePath, decryptData);

      event.returnValue = { data: tmpFilePath };
    });
  });


  const KEY_DIR = `${userHome}/.secunetMessenger`;
  const CONTACT_KEYS_DIR = `${KEY_DIR}/contacts`;
  if (!fs.existsSync(KEY_DIR)) {
    fs.mkdirSync(KEY_DIR);
    fs.mkdirSync(CONTACT_KEYS_DIR);
  }

  const savedContactKeys = fs.readdirSync(CONTACT_KEYS_DIR);

  savedContactKeys
    .map(keyPath => extractNumberFromKeyPath(keyPath))
    .map(number => [number, fs.readFileSync(contactKeyPath(number))])
    .forEach(([number, armoredKey]) => {
      importContactKey(number, armoredKey);
    });

  const KEY_FILE_NAME = 'user.key';


  // IPC function to ensure the existence of the private key.
  // returns the armored public key
  ipcMain.on(ENSURE_KEYPAIR_AVAILABLE, (event, { ourNumber }) => {
    if (KEY_STORE.myKey === null) {

      const keyFileName = `${KEY_DIR}/${KEY_FILE_NAME}`;
      if (fs.existsSync(keyFileName)) {

        const privKeyArmored = fs.readFileSync(keyFileName);

        kbpgp.KeyManager.import_from_armored_pgp({ armored: privKeyArmored }, (err, ourKeyManager) => {
          KEY_RING.add_key_manager(ourKeyManager);
          KEY_STORE.myKey = ourKeyManager;

          ourKeyManager.export_pgp_public({}, (err, pgpPublic) => {
            event.returnValue = { data: pgpPublic };
          });
        });
      } else {
        kbpgp.KeyManager.generate_ecc({ userid: ourNumber }, (err, ourKeyManager) => {
          KEY_RING.add_key_manager(ourKeyManager);
          KEY_STORE.myKey = ourKeyManager;

          ourKeyManager.sign({}, () => {
            ourKeyManager.export_pgp_private({}, (error, pgpPrivateArmored) => {
              fs.writeFileSync(keyFileName, pgpPrivateArmored);
            });

            ourKeyManager.export_pgp_public({}, (err, pgpPublic) => {
              event.returnValue = { data: pgpPublic };
            });
          });
        });
      }
    } else {
      KEY_STORE.myKey.export_pgp_public({}, (err, pgpPublic) => {
        event.returnValue = { data: pgpPublic };
      });
    }
  });

  ipcMain.on(RECEIVED_PUB_KEY, (event, { key, number }) => {
    if (!isContactKeyAvailable(number)) {
      fs.writeFileSync(contactKeyPath(number), key);
      importContactKey(number, key);
    }
  });

  ipcMain.on(TEST_CONTACT_KEY_AVAILABLE, (event, { number }) => {
    event.returnValue = { result: isContactKeyAvailable(number) }
  });

  function isContactKeyAvailable(number) {
    return (KEY_STORE.contacts[number] !== undefined) && fs.existsSync(contactKeyPath(number));
  }

  function importContactKey(number, key) {
    kbpgp.KeyManager.import_from_armored_pgp({ armored: key }, (err, ourKeyManager) => {
      KEY_RING.add_key_manager(ourKeyManager);
      KEY_STORE.contacts[number] = ourKeyManager;
    });
  }

  function contactKeyPath(number) {
    return `${CONTACT_KEYS_DIR}/${number}.key`;
  }


  function extractNumberFromKeyPath(keyPath) {
    const KEYFILE_REGEX = /([^/]+)\.key$/;
    return keyPath.match(KEYFILE_REGEX)[1];
  }
}
