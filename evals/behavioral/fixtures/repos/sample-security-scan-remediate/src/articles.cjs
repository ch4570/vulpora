'use strict';

async function readArticle(principal, id, repository) {
  return repository.findOne({ id });
}

module.exports = { readArticle };
