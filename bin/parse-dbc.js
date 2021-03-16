#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs'
import { DBC } from '../src/DBC'

const filename = process.argv[2]
const file = readFileSync(filename, 'utf8')
const dbc = new DBC(file)

console.log(`Saving DBC to ${filename}.json`)
writeFileSync(`${filename}.json`, JSON.stringify(dbc, null, 2))
