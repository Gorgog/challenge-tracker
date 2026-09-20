/** Идентификаторы блоков не должны совпасть с id челленджей. */
export const groupId = (group: string) => `group:${group}`

export const groupOf = (id: string) => id.replace(/^group:/, '')
