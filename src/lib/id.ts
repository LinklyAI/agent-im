import { nanoid } from 'nanoid'

export function messageId(): string {
  return `msg_${nanoid(8)}`
}
