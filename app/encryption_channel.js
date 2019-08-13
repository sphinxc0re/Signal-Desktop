const electron = require('electron');
const base64 = require('base64-arraybuffer');
const kbpgp = require('kbpgp');
const QRCode = require('qrcode');
const fs = require('fs');
const userHome = require('os').homedir();

const { ipcMain } = electron;

module.exports = {
  initialize,
};

let KEY_STORE = {};
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

function initialize() {
  if (initialized) {
    throw new Error('initialize: Already initialized!');
  }

  initialized = true;

  ipcMain.on(ENCRYPTION_REQUEST, (event, { data, key }) => {
    const binaryData = base64.decode(data);

    const params = {
      msg: binaryData,
      encrypt_for: KEY_STORE,
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
    if (KEY_STORE.myKey) {
      event.returnValue = null;
      return;
    }

    const keyFileName = `${KEY_DIR}/${KEY_FILE_NAME}`;
    if (fs.existsSync(keyFileName)) {
      const privKeyArmored = fs.readFileSync(keyFileName);

      kbpgp.KeyManager.import_from_armored_pgp({ armored: privKeyArmored }, (err, ourKeyManager) => {
        KEY_STORE.myKey = ourKeyManager;
      });
    } else {
      kbpgp.KeyManager.generate_ecc({ userid: ourNumber }, (err, ourKeyManager) => {
        KEY_STORE.myKey = ourKeyManager;

        ourKeyManager.export_pgp_private({}, (err, pgpPrivateArmored) => {
          fs.writeFileSync(keyFileName, pgpPrivateArmored);
        });
      });
    }

    event.returnValue = null;
  });

  ipcMain.on(RECEIVED_PUB_KEY, (event, { key, number }) => {
    KEY_STORE.contacts[number] = key;
  });
}
