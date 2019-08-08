const electron = require('electron');
const base64 = require('base64-arraybuffer');
const kbpgp = require('kbpgp');
const QRCode = require('qrcode');

const { ipcMain } = electron;

module.exports = {
  initialize,
};

let keyStore = null;

kbpgp.KeyManager.generate_ecc({ userid: '01577 1411568' }, (err, charlie) => {
  keyStore = charlie;
});

let initialized = false;

const DELIMITER = '-';

const PREFIX = 'vsnfd';
const keyWithPrefix = key => [PREFIX, key].join(DELIMITER);


// ipc keys
const ENCRYPTION_REQUEST = keyWithPrefix('encrypt-attachment');
const DECRYPTION_REQUEST = keyWithPrefix('decrypt-attachment');

function initialize() {
  if (initialized) {
    throw new Error('initialize: Already initialized!');
  }

  initialized = true;

  ipcMain.on(ENCRYPTION_REQUEST, (event, { data, key }) => {
    const binaryData = base64.decode(data);

    const params = {
      msg: binaryData,
      encrypt_for: keyStore,
    };

    kbpgp.box(params, (err, resultString) => {
      event.returnValue = { data: resultString };
    });
  });

  ipcMain.on(DECRYPTION_REQUEST, (event, { data }) => {
    // TODO: decryprtion
    event.returnValue = { data };
  });
}
