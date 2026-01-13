class NodeShim {
  nodeType: number

  constructor(nodeType: number) {
    this.nodeType = nodeType
  }
}

class ElementShim extends NodeShim {
  tagName?: string
  attributes: Record<string, string> = {}
  classList = {
    add() {},
    remove() {},
  }

  constructor(tag: string) {
    super(1)
    this.tagName = tag.toUpperCase()
  }

  setAttribute(name: string, value: string) {
    this.attributes[name] = value
  }

  appendChild() {}
}

class TextNodeShim extends NodeShim {
  textContent: string

  constructor(text?: string) {
    super(3)
    this.textContent = text ?? ''
  }
}

class CommentShim extends NodeShim {
  textContent: string

  constructor(text?: string) {
    super(8)
    this.textContent = text ?? ''
  }
}

class DocumentFragmentShim extends NodeShim {
  children: unknown[] = []

  constructor() {
    super(11)
  }

  appendChild() {}
}

type DocumentShim = {
  createElement: (tag: string) => ElementShim
  createElementNS: (ns: string, tag: string) => ElementShim
  createTextNode: (text?: string) => TextNodeShim
  createComment: (text?: string) => CommentShim
  createDocumentFragment: () => DocumentFragmentShim
  addEventListener: (...args: unknown[]) => void
  removeEventListener: (...args: unknown[]) => void
}

export function ensureDocumentShim(): void {
  const global = globalThis as typeof globalThis & {
    document?: DocumentShim
    Element?: typeof ElementShim
    SVGElement?: typeof ElementShim
    Node?: typeof NodeShim
    Text?: typeof TextNodeShim
    Comment?: typeof CommentShim
    DocumentFragment?: typeof DocumentFragmentShim
  }

  if (global.document !== undefined) {
    return
  }

  const doc: DocumentShim = {
    createElement: (tag: string) => new ElementShim(tag),
    createElementNS: (_ns: string, tag: string) => new ElementShim(tag),
    createTextNode: (text?: string) => new TextNodeShim(text),
    createComment: (text?: string) => new CommentShim(text),
    createDocumentFragment: () => new DocumentFragmentShim(),
    addEventListener() {},
    removeEventListener() {},
  }

  global.document = doc
  global.Element = ElementShim
  global.SVGElement = ElementShim
  global.Node = NodeShim
  global.Text = TextNodeShim
  global.Comment = CommentShim
  global.DocumentFragment = DocumentFragmentShim
}
