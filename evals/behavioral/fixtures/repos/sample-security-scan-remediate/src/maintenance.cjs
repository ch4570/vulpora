'use strict';

// registry is the trusted lease authority; clients are already bound transports.
// Neither caller flags nor the requested target name attest those bindings.
async function maintain(request, context, registry, clients) {
  if (request.kind === 'search') {
    return clients.search.deleteByQuery({ index: request.target, query: { match_all: {} } });
  }
  if (request.kind === 'objects') {
    return clients.objects.deleteObjects({ bucket: request.target, prefix: request.prefix || '' });
  }
  if (request.kind === 'queue') {
    return clients.queue.purge({ queue: request.target });
  }
  throw new Error('Unknown operation');
}

module.exports = { maintain };
