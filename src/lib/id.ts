import { nanoid } from 'nanoid'

export function threadId(): string {
  return `th_${nanoid(8)}`
}

export function messageId(): string {
  return `msg_${nanoid(8)}`
}
