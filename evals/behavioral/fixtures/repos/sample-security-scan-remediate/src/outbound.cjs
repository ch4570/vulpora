'use strict';

// The integration supports one vendor origin: https://api.example.invalid.
async function fetchDocument(url, transport) {
  return transport.get(url, { redirect: 'follow' });
}

module.exports = { fetchDocument };
