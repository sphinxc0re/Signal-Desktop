const electron = require('electron');
const base64 = require('base64-arraybuffer');
const kbpgp = require('kbpgp');
const fs = require('fs');
const userHome = require('os').homedir();

const { ipcMain } = electron;

module.exports = {
  initialize,
};

const KEY_STORE = {};
KEY_STORE.myKey = null;
KEY_STORE.contacts = {};

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
    };

    kbpgp.box(params, (err, resultString) => {
      event.returnValue = { data: resultString };
    });
  });

  ipcMain.on(DECRYPTION_REQUEST, (event, { data }) => {
    kbpgp.unbox({ keyfetch: KEY_STORE, armored: data }, (err, literals) => {

      event.returnValue = { data: literals[0].toString() };
    });
  });


  const KEY_DIR = `${userHome}/.secunetMessenger`;
  const CONTACT_KEYS_DIR = `${KEY_DIR}/contacts`;
  if (!fs.existsSync(KEY_DIR)) {
    fs.mkdirSync(KEY_DIR);
    fs.mkdirSync(CONTACT_KEYS_DIR);
  }

  const KEY_FILE_NAME = 'user.key';

  ipcMain.on(ENSURE_KEYPAIR_AVAILABLE, (event, { ourNumber }) => {
    const savedContactKeys = fs.readdirSync(CONTACT_KEYS_DIR);

    savedContactKeys
      .map(keyPath => extractNumberFromKeyPath(keyPath))
      .map(number => [number, fs.readFileSync(contactKeyPath(number))])
      .forEach(([number, armoredKey]) => {
        importContactKey(number, armoredKey);
      });

    if (KEY_STORE.myKey === null) {
      console.log('KEY is null');

      const keyFileName = `${KEY_DIR}/${KEY_FILE_NAME}`;
      if (fs.existsSync(keyFileName)) {
        console.log('KEYFILE EXISTS');

        const privKeyArmored = fs.readFileSync(keyFileName);

        kbpgp.KeyManager.import_from_armored_pgp({ armored: privKeyArmored }, (err, ourKeyManager) => {
          console.log('ERROR 1: ', err);

          KEY_STORE.myKey = ourKeyManager;

          ourKeyManager.export_pgp_public({}, (err, pgpPublic) => {
            event.returnValue = { data: pgpPublic };
          });
        });
      } else {
        console.log('KEYFILE DOESNT EXIST');
        kbpgp.KeyManager.generate_ecc({ userid: ourNumber }, (err, ourKeyManager) => {
          console.log('ERROR 2: ', err);

          KEY_STORE.myKey = ourKeyManager;

          ourKeyManager.sign({}, () => {
            ourKeyManager.export_pgp_private({}, (error, pgpPrivateArmored) => {
              console.log('ERROR 3: ', err);

              console.log('PGPKEY', pgpPrivateArmored);

              fs.writeFileSync(keyFileName, pgpPrivateArmored);
            });

            ourKeyManager.export_pgp_public({}, (err, pgpPublic) => {
              event.returnValue = { data: pgpPublic };
            });
          });
        });
      }

      console.log('KEY is', KEY_STORE.myKey);
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
      KEY_STORE.contacts[number] = ourKeyManager;
    });
  }

  function contactKeyPath(number) {
    return `${CONTACT_KEYS_DIR}/${number}.key`;
  }

  const KEYFILE_REGEX = /([^/]+)\.key$/;

  function extractNumberFromKeyPath(keyPath) {
    return keyPath.match(KEYFILE_REGEX)[1];
  }
}
