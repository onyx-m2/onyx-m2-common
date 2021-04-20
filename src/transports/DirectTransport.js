import M2 from '../M2'
import Transport from './Transport'

const log = console

/**
 * Defines the direct connection abstraction of a transport. The details of this direct
 * interface are handle by the M2 class.
 */
export default class DirectTransport extends Transport {

  /**
   * Construct a native
   */
  constructor(dbc) {
    super()
    this.m2 = new M2(this)
    this.dbc = dbc

    // is the M2 currently connected?
    this.connected = false

    // synthetic session number to mimic the websocket transport, this will be incremented
    // with every reconnect
    this.sessionNumber = 1

    // list of signal subscriptions
    this.subscriptions = []

    // list of signals to send only once
    this.oneShotSignals = []

    // a map of how many signals require a given message
    this.signalEnabledMessageRefs = {}
  }

  sendCommand(command) {
    throw new Error('Subclasses of a direct transport must implement the sendCommand method')
  }

  /**
   * Send an event to the M2. These are the same high-level events that the server
   * supports.
   *
   * Note that a number of event types are not implemented (yet?) in direct mode. These
   * are mostly those that exist for the diagnostic tools.
   */
  send(event, data) {
    switch (event) {

      // handle pings by immediately sending a pong; this'll simulate a zero latency
      // connection with the server
      case 'ping':
        this.dispatchEvent('pong')
        break

      case 'subscribe':
        this.subscribe(data)
        break

      case 'unsubscribe':
        this.unsubscribe(data)
        break

      case 'get':
        this.oneShotSignals.push(...data)
        this.getLastSignalValues(data)
        break

      default:
        log.warn(`Ignoring request to send event ${event} to m2`)
    }
  }

  /**
   * Process messages from M2 by performing the signal parsing the server would normally
   * do and dispatching 'signal' events to listeners.
   */
  processMessage(bus, id, bits) {
    const def = this.dbc.getMessageFromId(bus, id)
    if (!def) {
      return log.warn(`No definition for message ${id} on bus ${bus}`)
    }
    const ingress = {}
    if (def.signals) {
      def.signals.forEach(s => {
        ingress[s.mnemonic] = this.dbc.decodeSignal(bits, s)
      })
    }
    if (def.multiplexor) {
      const multiplexId = ingress[def.multiplexor.mnemonic] = this.dbc.decodeSignal(bits, def.multiplexor)
      const multiplexed = def.multiplexed[multiplexId]
      if (multiplexed) {
        multiplexed.forEach(s => {
          ingress[s.mnemonic] = this.dbc.decodeSignal(bits, s)
        })
      } else {
        log.warn(`Message ${def.mnemonic} doesn't have a multiplexed signal for ${multiplexId}`)
      }
    }
    const subscribedSignals = this.subscriptions.filter(s => s in ingress)
    const oneShotSignals = this.oneShotSignals.filter(s => s in ingress)
    const signals = [...new Set([...subscribedSignals, ...oneShotSignals])].map(s => [s, ingress[s]])
    if (signals.length > 0) {
      this.dispatchEvent('signal', signals)
    }
    this.oneShotSignals = this.oneShotSignals.filter(s => !oneShotSignals.includes(s))
  }

  // TODO: Most of the functions below are lifted verbatim from the server code. Make
  // a shared package?

  /**
   * Subscribe to a series of signals. The app should ensure it doesn't double subscribe
   * to any given signal.
   */
  subscribe(signals) {
    for (const signal of signals) {
      this.subscriptions.push(signal)
      this.addSignalMessageRef(signal)
    }
    this.getLastSignalValues(signals)
  }

  /**
   * Unsubscribe to a series of signals.
   */
  unsubscribe(signals) {
    for (const signal of signals) {
      const index = this.subscriptions.indexOf(signal)
      if (index > -1) {
        this.subscriptions.splice(index, 1)
        this.releaseSignalMessageRef(signal)
      }
    }
  }

  addSignalMessageRef(signal) {
    const message = this.dbc.getSignalMessage(signal)
    if (!message) {
      return log.warn(`Attempting to subscribe to nonexistent signal ${signal}`)
    }
    let refs = this.signalEnabledMessageRefs[message.mnemonic] || 0
    if (refs === 0 && this.connected) {
      this.m2.enableMessage(message.bus, message.id)
    }
    this.signalEnabledMessageRefs[message.mnemonic] = refs + 1
  }

  releaseSignalMessageRef(signal) {
    const message = this.dbc.getSignalMessage(signal)
    if (!message) {
      log.warn(`Attempting to unsubscribe from nonexistent signal ${signal}`)
      return
    }
    let refs = this.signalEnabledMessageRefs[message.mnemonic] || 0
    if (refs > 0) {
      if (refs === 1 && this.connected) {
        this.m2.disableMessage(message.bus, message.id)
      }
      this.signalEnabledMessageRefs[message.mnemonic] = refs - 1
    }
  }

  enableAllSubscribedMessages() {
    log.debug(`Enabling all subscribed messages`)
    const mnemonics = Object.keys(this.signalEnabledMessageRefs)
    for (const mnemonic of mnemonics) {
      log.debug(`Enabling message ${mnemonic}, has ${this.signalEnabledMessageRefs[mnemonic]} signals`)
      const message = this.dbc.getMessage(mnemonic)
      this.m2.getLastMessageValue(message.bus, message.id)
      this.m2.enableMessage(message.bus, message.id)
    }
  }

  getLastSignalValues(signals) {
    if (this.connected) {
      const messages = [...new Set(signals.map(s => this.dbc.getSignalMessage(s)))]
      for (const message of messages) {
        this.m2.getLastMessageValue(message.bus, message.id)
      }
    }
  }

}
