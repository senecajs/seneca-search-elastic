const Elasticsearch = require('elasticsearch')


const SENECA_INDEX = 'seneca'
const SENECA_DOCTYPE = 'senecadoctype'


async function search_elastic(options) {
  const seneca = this


  if (null == options.elastic) {
    return seneca.fail('The "elastic" option is required')
  }


  const { elastic: elastic_config } = options
  const elastic_client = new Elasticsearch.Client(elastic_config)


  const has_index = await elastic_client.indices.exists({
    index: SENECA_INDEX
  })

  if (!has_index) {
    await elastic_client.indices.create({
      index: SENECA_INDEX
    })
  }


  seneca.add('sys:search,cmd:add', async function (msg, reply) {
    if (null == msg.doc) {
      return reply(null, {
        ok: false,
        why: 'invalid-field',
        details: {
          path: ['doc'],
          why_exactly: 'required'
        }
      })
    }

    const { doc } = msg


    if (null == typeof doc.id) {
      return reply(null, {
        ok: false,
        why: 'invalid-field',
        details: {
          path: ['doc', 'id'],
          why_exactly: 'required'
        }
      })
    }

    const { id: doc_id } = doc


    const body = { ...doc }; delete body.id

    const created = await elastic_client.create({
      index: SENECA_INDEX,
      type: SENECA_DOCTYPE,
      id: doc_id,
      body,

      // NOTE: Yes, "refresh" has to be a string:
      // https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/16.x/api-create.html
      //
      refresh: 'true'
    })

    if ('created' !== created.result) {
      console.error(created.result) // TODO: Proper logging.
      return reply(null, { ok: false })
    }


    return reply(null, { ok: true })
  })


  seneca.add('sys:search,cmd:search', async function (msg, reply) {
    if (null == msg.query) {
      return reply(null, {
        ok: false,
        why: 'invalid-field',
        details: {
          path: ['query'],
          why_exactly: 'required'
        }
      })
    }

    const { query } = msg


    // NOTE: For more information, please see documentation at:
    //
    // https://www.npmjs.com/package/elasticsearch
    //
    //
    const out = await elastic_client.search({
      index: SENECA_INDEX,
      q: query
    })


    const hits = out.hits.hits.map(hit => ({
      id: hit._id,
      doc: hit._source
    }))

    return reply(null, { ok: true, data: { hits } })
  })


  seneca.add('sys:search,cmd:remove', async function (msg, reply) {
    if (null == msg.id) {
      return reply(null, {
        ok: false,
        why: 'invalid-field',
        details: {
          path: ['id'],
          why_exactly: 'required'
        }
      })
    }

    const { id: doc_id } = msg


    const removed = await elastic_client.delete({
      index: SENECA_INDEX,
      type: SENECA_DOCTYPE,
      id: doc_id
    })

    if ('deleted' !== removed.result) {
      return reply(null, { ok: false, why: 'remove-failed' })
    }


    return reply(null, { ok: true })
  })


  /* NOTE: This is a workaround, because Seneca's "ready" event will currently
   * trigger _before_ async plugins have finished their initialization. Listen
   * to this event in order to safely continue operations against the
   * Elasticsearch instance.
   */
  seneca.emit('plugin_ready:search-elastic')


  return
}


module.exports = search_elastic
