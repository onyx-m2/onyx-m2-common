const CATEGORIES = {
  apb: "Autopilot bridge",
  app: "Autopilot primary",
  aps: "Autopilot secondary",
  bms: "Battery management system",
  cc: "Charging controller",
  cmp: "Compressor",
  cmpd: "Heat pump",
  cp: "Charging port",
  das: "Driver assistance system",
  dis: "Driver intervention system",
  di: "Drive inverter",
  epas3p: "Primary electric power assist steering",
  epas3s: "Secondary electric power assist steering",
  epbl: "Left electric parking brake",
  epbr: "Right electric parking brake",
  esp: "Electronic stability program",
  fc: "Fast charging",
  gtw: "Gateway",
  hvp: "High voltage protection",
  ibst: "Power braking system",
  ocs1p: "Occupant classification system",
  odin: "Diagnostics service",
  park: "Park assist system",
  pcs: "Power conversion system",
  pms: "Pedal monitor slave",
  pm: "Pedal monitor",
  ptc: "Heater",
  radc: "Radar center",
  rcm: "Restraint control module",
  sccm: "Steering wheel control module",
  scm: "Supercharger",
  scs: "Secondary Supercharger",
  tas: "Air suspension",
  tpms: "Tire pressure management system",
  uds: "Universal diagnostics system",
  ui: "User interface",
  utc: "Universal time",
  umc: "Universal mobile connector",
  vcfront: "Front vehicle controller",
  vcleft: "Left vehicle controller",
  vcright: "Right vehicle controller",
  vcsec: "Vehicle security controller",
  vin: "Vehicle identification",
  uncat: "Uncategorized"
}

const BUSES = {
  'VEH': 0,
  'CH': 1
}

/**
 * Data access class to navigate DBC files, with fast lookup by slug, id, and mnemonic.
 */
export default class DBC {

  /**
   * Construct a DBC object using the specified pre-loaded data.
   * @param {Object} definitions The parsed json data containing the message and signal definitions
   */
  constructor(file) {
    parseCategoriesAndMessages(this, file)

    // indexes
    this.messageById = {}
    this.messageBySlug = {}
    this.messageByMnemonic = {}
    this.signalByMnemonic = {}
    this.messageBySignalMnemonic = {}
    this.messages.forEach(m => indexMessage(this, m))
  }

  /**
   * Remove indexes from generated JSON representation.
   */
  toJSON() {
    const { categories, messages } = this
    return { categories, messages }
  }

  /**
   * Add a message to the DBC definitions, and have it get indexed.
   * @param {Object} message A message definition
   */
  addMessage(message) {
    if (!this.getMessageFromId(message.bus, message.id)) {
      this.messages.push(message)
      indexMessage(this, message)
    }
  }

  /**
   * Get the message that matches the specified category and message slugs.
   * @param {String} categorySlug
   * @param {String} messageSlug
   */
  getMessageFromSlugs(categorySlug, messageSlug) {
    return this.messageBySlug[categorySlug + '/' + messageSlug]
  }

  /**
   * Get the message that matches the specified id.
   * @param {Number} id
   */
  getMessageFromId(bus, id) {
    const message = this.messageById[id]
    if (message && message.bus === bus) {
      return message
    }
    return null
  }

  /**
   * Get the message that matches the specified mnemonic.
   * @param {String} mnemonic
   */
  getMessage(mnemonic) {
    return this.messageByMnemonic[mnemonic]
  }

  /**
   * Get the signal that matches the specified mnemonic.
   * @param {String} mnemonic
   */
  getSignal(mnemonic) {
    return this.signalByMnemonic[mnemonic]
  }

   /**
   * Get the signal value that matches the specified mnemonic and name.
   * @param {String} mnemonic: Signal mnemonic
   * @param {String} name: Value name
   */
  getSignalNamedValue(mnemonic, name) {
    const signal = this.signalByMnemonic[mnemonic]
    if (signal && signal.namedValues) {
      return signal.namedValues[name]
    }
  }

  /**
   * Get all the categories.
   */
  getCategories() {
    return this.categories
  }

  /**
   * Get the first category.
   */
  getFirstCategory() {
    return this.categories[0]
  }

  /**
   * Get the  category that matches the specified slug.
   * @param {String} slug
   */
  getCategory(slug) {
    return this.categories.find(c => c.slug === slug)
  }

  /**
   * Get the first message of the category that matches the specified slug.
   * @param {String} slug
   */
  getFirstCategoryMessage(slug) {
    return this.messages.find(m => m.category === slug)
  }

  /**
   * Get the messages that match the category of the specified slug.
   * @param {String} slug
   */
  getCategoryMessages(slug) {
    return this.messages.filter(m => m.category === slug)
  }

  /**
   * Get all the signals of the message that matches the specified mnemonic.
   * @param {String} mnemonic
   */
  getMessageSignals(mnemonic) {
    const message = this.getMessage(mnemonic)
    let signals = []
    if (message) {
      if (message.multiplexor) {
        signals.push(message.multiplexor)
      }
      if (message.signals) {
        signals = signals.concat(message.signals)
      }
      if (message.multiplexed) {
        signals = signals.concat(Object.values(message.multiplexed).flat())
      }
    }
    return signals
  }

  decodeSignal(bitView, signal) {
    try {
      const val = bitView.getBits(signal.start, signal.length, signal.signed)
      return signal.offset + signal.scale * val
    } catch {
      return NaN
    }
  }

  getSignalMessage(mnemonic) {
    return this.messageBySignalMnemonic[mnemonic]
  }

}

function toSlug(mnemonic) {
  return [...mnemonic]
    .map(c => (c != c.toLowerCase()) ? '-' + c.toLowerCase() : c)
    .join('')
}

function toName(mnemonic) {
  return [...mnemonic]
    .map((c, i) => {
      if (i == 0) {
        return c.toUpperCase()
      } else if (c != c.toLowerCase()) {
        return ' ' + c.toLowerCase()
      }
      return c
    })
    .join('')
}

function parseCategoriesAndMessages(dbc, file) {
  const messages = []
  const lines = file.split(/\r?\n/)
  lines.forEach(line => {
    // message
    if (line.startsWith('BO_')) {
      const parts = /BO_ (\d+) (\w+_)?(\w+): (\d+) (\w+)/.exec(line)
      if (!parts) {
        console.warn(`Failed to parse message: "${line}"`)
        return
      }
      const id = Number(parts[1])
      var category = 'UNCAT'
      if (parts[2]) {
        category = parts[2].substring(0, parts[2].length - 1)
        if (category.startsWith('ID')) {
          category = category.substring(5)
        }
      }
      const mnemonic = parts[3]
      const length = Number(parts[4])
      let bus = BUSES[parts[5]]
      if (bus === undefined) {
        console.warn(`Failed to find bus in message: "${line}", defaulting to 0`)
        warnings.push(line)
        bus = 0
      }
      const slug = toSlug(mnemonic)
      const name = toName(mnemonic)
      messages.push({ id,
        mnemonic: `${category}_${mnemonic}`,
        category: category.toLowerCase(),
        bus, slug, name, length
      })
    }

    // signal
    if (line.startsWith(' SG_')) {
      const parts = /\s*SG_ (\w+_)?(\S+)\s*(M?)m?(\d*)\s*: (\d+)\|(\d+)@\d(\+|-) \((.+),(.+)\) \[.+\] "(.*)"/.exec(line)
      if (!parts) {
        console.warn(`Failed to parse signal: "${line}"`)
        return
      }
      var category = 'UNK'
      if (parts[1]) {
        category = parts[1].substring(0, parts[1].length - 1)
      }
      var mnemonic = parts[2]
      var multiplexor = parts[3] == 'M' // ignoring for now
      var multiplexed = parts[4]      // ignoring for now
      const start = Number(parts[5])
      const length = Number(parts[6])
      const signed = parts[7] == '-'
      const scale = Number(parts[8])
      const offset = Number(parts[9])
      const units = parts[10]
      const slug = toSlug(mnemonic)
      const name = toName(mnemonic)

      const message = messages[messages.length - 1]
      const signal = {
        mnemonic: `${category}_${mnemonic}`,
        slug, name, start, length, signed, scale, offset, units
      }
      if ((multiplexor || multiplexed) && !message.multiplexed) {
        message.multiplexed = {}
      }
      if (multiplexor) {
        message.multiplexor = signal
      }
      else if (multiplexed) {
        if (!message.multiplexed[multiplexed]) {
          message.multiplexed[multiplexed] = []
        }
        message.multiplexed[multiplexed].push(signal)
      }
      else {
        if (!message.signals) {
          message.signals = []
        }
        message.signals.push(signal)
      }
    }

    // value
    if (line.startsWith('VAL_')) {
      var parts = /VAL_ (\d+) (\S+) (.*);/.exec(line)
      if (!parts) {
        console.warn(`Failed to parse value: "${line}"`)
        return
      }

      const id = Number(parts[1])
      const mnemonic = parts[2]
      const valueList = parts[3]
      const values = {}
      const re = /(\d+) "([^\"]+)"/g
      while (parts = re.exec(valueList)) {
        values[Number(parts[1])] = parts[2]
      }

      const message = messages.find(m => m.id == id)
      if (!message) {
        console.error(`Failed to find message for value "${id}" in line "${line}`)
        return
      }

      var signal
      if (message.signals) {
        signal = message.signals.find(s => s.mnemonic == mnemonic)
      }
      if (!signal && message.multiplexor) {
        if (message.multiplexor.mnemonic == mnemonic) {
          signal = message.multiplexor
        }
      }
      if (!signal && message.multiplexed) {
        Object.values(message.multiplexed).forEach(signals => {
          if (!signal) {
            signal = signals.find(s => s.mnemonic == mnemonic)
          }
        })
      }

      if (!signal) {
        console.error(`Failed to find signal for value "${mnemonic}" in line "${line}`)
        return
      }
      signal.values = values
    }
  })

  const categories = [...new Set(messages.map(m => m.category))].sort().map(slug => {
    let name = CATEGORIES[slug]
    if (!name) {
      name = `Unknown category ${slug.toUpperCase()}`
    }
    return { slug, name }
  })

  messages.forEach(m => {
    if (m.signals) {
      m.signals.sort((f, s) => f.start - s.start)
    }
    if (m.multiplexed) {
      Object.values(m.multiplexed).forEach(signals => {
        signals.sort((f, s) => f.start - s.start)
      })
    }
  })

  dbc.categories = categories
  dbc.messages = messages
}

function indexMessage(dbc, message) {
  dbc.messageById[message.id] = message
  dbc.messageBySlug[message.category + '/' + message.slug] = message
  dbc.messageByMnemonic[message.mnemonic] = message
  if (message.signals) {
    message.signals.forEach(s => {
      dbc.messageBySignalMnemonic[s.mnemonic] = message
      dbc.signalByMnemonic[s.mnemonic] = s
      if (s.values) {
        s.namedValues = {}
        Object.keys(s.values).forEach(k => {
          s.namedValues[s.values[k]] = Number(k)
        })
      }
    })
  }
  if (message.multiplexor) {
    const { mnemonic } = message.multiplexor
    dbc.messageBySignalMnemonic[mnemonic] = message
    dbc.signalByMnemonic[mnemonic] = message.multiplexor
  }
  if (message.multiplexed) {
    Object.values(message.multiplexed).flat().forEach(s => {
      dbc.messageBySignalMnemonic[s.mnemonic] = message
      dbc.signalByMnemonic[s.mnemonic] = s
    })
  }
}
