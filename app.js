const SUMMARY_SIZE = 1000

const BigNumber = require('bignumber.js')

const {RippleAPI} = require('ripple-lib')
const api = new RippleAPI({server: 'ws://r.ripple.com:51233'})

const {RTMClient, WebClient} = require('@slack/client')

const token = process.env.SLACK_TOKEN
let rtm
let web
if (token) {
  rtm = new RTMClient(token)
  rtm.start()
  web = new WebClient(token)
}
runBot()

async function runBot() {
  await api.connect()
  console.log('connected to rippled')
  let channel_id
  if (web) {
    const res = await web.channels.list()
    channel_id = await getChannelId(res.channels)

    function getChannelId(channels) {
      return new Promise((resolve, reject) => {
        channels.forEach(c => {
          if (c.is_member) {
            console.log(`member of #${c.name}`)
            if (c.name === 'xrp-bot') {
              console.log(`using channel #xrp-bot with id:${c.id}`)
              resolve(c.id)
            }
          }
        })
        reject(new Error('channel #xrp-bot not found or not member'))
      })
    }
  }

  const serverInfo = await api.getServerInfo()
  const m = `Connected to rippled ${serverInfo.buildVersion} with ledgers ${serverInfo.completeLedgers}`
  console.log(m)

  await api.request('subscribe', {
    streams: ['transactions']
  })

  api.connection.on('transaction', event => {
    process.stdout.write('.')
    const fee = new BigNumber(event.transaction.Fee)
    if (fee.gt('1000000')) {
      const txnMsg = `I saw a transaction pay a fee of ${fee.toString(10)} drops (${fee.dividedBy('1000000').toString(10)} XRP). https://xrpcharts.ripple.com/#/transactions/${event.transaction.hash}`
      post(txnMsg)
    }
  })

  const ledgers = []
  api.connection.on('ledgerClosed', event => {
    api.getLedger().then(ledger => {
      ledgers.push(ledger)
      
      if (ledgers.length >= 2) {
        const currentDrops = new BigNumber(ledgers[ledgers.length - 1].totalDrops)
        const previousDrops = new BigNumber(ledgers[ledgers.length - 2].totalDrops)
        const lostDrops = previousDrops.minus(currentDrops)
        if (lostDrops.gt('3000000')) {
          const msg = `Ledger ${ledger.ledgerVersion} burned ${lostDrops.toString(10)} drops (${dropsToXrp(lostDrops)} XRP).`
          post(msg)
        }
      }

      if (ledger.ledgerVersion % SUMMARY_SIZE === 0 && ledgers.length > SUMMARY_SIZE) {
        const lastLedgers = ledgers.slice(ledgers.length - SUMMARY_SIZE, ledgers.length)

        let min = undefined
        let max = undefined

        const result = lastLedgers.map(l => {
          return {
            ledgerVersion: l.ledgerVersion,
            totalDrops: new BigNumber(l.totalDrops)
          }
        }).reduce(
          (previous, current) => {
            const lostDrops = previous.totalDrops.minus(current.totalDrops)

            if (!min || lostDrops.lt(min)) {
              min = lostDrops
            }
            if (!max || lostDrops.gt(max)) {
              max = lostDrops
            }

            const previousTotalLostDrops = new BigNumber(previous.totalLostDrops || '0')
            const totalSoFar = previousTotalLostDrops.plus(lostDrops)
            
            return Object.assign(
              {},
              current,
              {
                totalLostDrops: totalSoFar
              }
            )
          }
        )
        const summary = createSummary({
          lastLedgers,
          result,
          min,
          max
        })
        post(summary)
      }
    })
  })

  function post(msg) {
    console.log(msg)
    if (rtm && channel_id) {
      rtm.sendMessage(msg, channel_id).then(res => {
        console.log(`sent with ts:${res.ts}`)
      })
    }
  }
}

function createSummary(data) {
  const {
    lastLedgers,
    result,
    min,
    max
  } = data
  return `For ledgers ${lastLedgers[0].ledgerVersion} to ${lastLedgers[SUMMARY_SIZE - 1].ledgerVersion}, a total of ${result.totalLostDrops} drops were burned (${dropsToXrp(result.totalLostDrops)} XRP).

min: ${min} (${dropsToXrp(min)} XRP).
max: ${max} (${dropsToXrp(max)} XRP).`
}

function dropsToXrp(drops) {
  return new BigNumber(drops).dividedBy('1000000').toString(10)
}
