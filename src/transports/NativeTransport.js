import { BitView } from 'bit-buffer'
import DirectTransport from './DirectTransport'

const log = console

/**
 * Implements a native transport that leverages a natively inject mechanism for
 * communicating with the m2 device. This only works if running in a web view on a real
 * device that has Bluetooth access to the m2 device. The details of this native
 * interface are handle by the M2 class (in ./utils).
 */
export default class NativeTransport extends DirectTransport {

  /**
   * Construct a native transport.
   */
  constructor(dbc) {
    if (!global.M2) {
      throw new Error('Native transport requires M2 fixtures from the mobile app host')
    }
    super(dbc)

    // subscribe to m2 events
    global.addEventListener('m2', (event) => this.handleM2(event))
  }

  /**
   * Send the specified command through the native interface to the M2.
   */
   sendCommand(command) {
    global.M2.sendCommand(JSON.stringify(command))
  }

  /**
   * Handle events from M2 by unpacking them and dispatching them to the listeners.
   * There is also additional processing that happens on 'status' and 'message' events.
   */
  handleM2({ detail: { event, data }}) {
    if (event === 'status') {
      this.handleStatus(data)
    }
    if (event === 'message') {
      this.handleMessage(data)
    }
    this.dispatchEvent(event, data)
  }

  /**
   * Handle status changes from M2 on re-connections by re-enabling the subscribed
   * messages in case the connectivity issue was caused by M2 resetting (and thus
   * loosing its state).
   */
  handleStatus([ newConnectedStatus ]) {
    const previousConnectedStatus = this.connected
    this.connected = newConnectedStatus
    if (newConnectedStatus && !previousConnectedStatus) {
      this.enableAllSubscribedMessages()
    }
  }

  /**
   * Handle messages by unpacking the data from the native interface and send to the
   * direct layer for decoding and dispatching.
   */
  handleMessage([ ts, bus, id, data ]) {
    const bits = new BitView(Uint8Array.from(data).buffer)
    this.processMessage(bus, id, bits)
  }

}
