const electron = require('electron');
const base64 = require('base64-arraybuffer');

const { ipcMain } = electron;

module.exports = {
  initialize,
};

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

    // TODO: encryption

    const armoredData = base64.encode(binaryData);

    event.returnValue = { data: armoredData };
  });

  ipcMain.on(DECRYPTION_REQUEST, (event, { data }) => {
    // TODO: decryprtion
    event.returnValue = { data };
  });
}
