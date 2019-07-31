const electron = require('electron');

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

async function initialize() {
  if (initialized) {
    throw new Error('initialize: Already initialized!');
  }

  initialized = true;

  ipcMain.on(ENCRYPTION_REQUEST, (event, { data, key }) => {
    event.returnValue = { data };
  });

  ipcMain.on(DECRYPTION_REQUEST, (event, { data }) => {
    event.returnValue = { data };
  });
}
