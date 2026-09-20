import { EventEmitter } from 'node:events'

/** Shared process-level bus for configuration changes observed by client services. */
const eventBus = new EventEmitter()

export { eventBus }
