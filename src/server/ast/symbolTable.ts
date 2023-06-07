import {Parser} from '../parser/parser'

export enum SymbolTypes
{
	invalid = 0x0000,
	integer = 0x0001,
	signed = integer | 0x0000,
	unsigned = 0x0002,
	int8Bit = integer | 0x0000,
	int16Bit = integer | 0x0004,
	int32Bit = integer | 0x0008,
	int64Bit = integer | 0x000C,
	character = 0x0010,
	list = 0x0020,
	string = character | list,
	struct = 0x0040,
	dict = struct | list,
	array = 0x0080,
	set = struct | array,
	bool = 0x0100,
	function = 0x0200,
	reference = 0x0400,
	pointer = 0x0800,
	pack = 0x1000, // This is for template type/value packs
	auto = 0x2000,
	none = 0x4000,
	type = 0x8000
}

export class SymbolType
{
	private type: SymbolTypes = SymbolTypes.invalid

	constructor(type?: SymbolTypes)
	{
		if (type)
			this.type = type
	}

	assign(type: SymbolTypes) { this.type = type }
	combine(type: SymbolTypes) { return this.type | type }
	append(type: SymbolTypes) { this.type |= type }
	mask(type: SymbolTypes): SymbolTypes { return this.type & type }
	without(type: SymbolTypes): SymbolTypes { return this.mask(~type) }

	forValue(): SymbolType
	{
		// Strip `pack` temporarily as it doesn't change the below logic.
		const type = this.without(SymbolTypes.pack)
		// `type` is a special type and decays into auto+type
		if (type === SymbolTypes.type)
			return new SymbolType(this.type | SymbolTypes.auto)
		// To construct a value type otherwise, mask off SymbolTypes.type
		return new SymbolType(this.type & ~SymbolTypes.type)
	}

	isEqual(symbolType: SymbolType | SymbolTypes)
	{
		if (symbolType instanceof SymbolType)
			return this.type === symbolType.type
		return this.type === symbolType
	}

	toString()
	{
		let type = this.type
		const reference = type & SymbolTypes.reference ? 'reference ' : undefined
		const pointer = type & SymbolTypes.pointer ? 'pointer ' : undefined
		const pack = type & SymbolTypes.pack ? 'pack ' : undefined
		const kind = reference ?? pointer ?? pack ?? ''
		const signedness = type & SymbolTypes.unsigned ? 'u' : ''
		const isType = type !== SymbolTypes.type && (type & SymbolTypes.type) === SymbolTypes.type
		type &= ~(SymbolTypes.reference | SymbolTypes.pointer | SymbolTypes.pack | SymbolTypes.unsigned)
		if (isType)
		{
			type &= ~SymbolTypes.type
			return `type ${kind}'${signedness}${SymbolTypes[type]}'`
		}
		return `${kind}${signedness}${SymbolTypes[type]}`
	}

	get isInvalid() { return this.type === SymbolTypes.invalid }

	clone() { return new SymbolType(this.type) }
}

export class MangroveSymbol
{
	private readonly _ident: string
	private _type: SymbolType = new SymbolType()
	private _struct?: SymbolStruct

	constructor(ident: string, type?: SymbolType)
	{
		this._ident = ident
		if (type)
			this._type = type
	}

	allocStruct(parser: Parser)
	{
		this._struct = new SymbolStruct(parser)
		this._type.assign(SymbolTypes.struct | SymbolTypes.type)
	}

	isEqual(symbol: MangroveSymbol) { return this._ident === symbol._ident && this._type.isEqual(symbol._type) }

	get value() { return this._ident }
	set type(type: SymbolType) { this._type = type }
	get type() { return this._type }
	get structure() { return this._struct }
	toString() { return `<Symbol '${this.value}' -> ${this.type}>` }

	get isAuto() { return this.type.mask(SymbolTypes.auto) === SymbolTypes.auto }
	get isType() { return this.type.mask(SymbolTypes.type) === SymbolTypes.type }
	get isStruct() { return this.type.mask(SymbolTypes.struct) === SymbolTypes.struct }

	clone()
	{
		const result = new MangroveSymbol(this._ident, this._type.clone())
		result._struct = this._struct
		return result
	}
}

export class SymbolTable
{
	private _parentTable?: SymbolTable
	private _table: Map<string, MangroveSymbol> = new Map()

	constructor(parser: Parser)
	{
		this._parentTable = parser.symbolTable
		parser.symbolTable = this
	}

	get empty() { return this.table.size === 0 }
	get entryCount() { return this.table.size }
	get table() { return this._table }
	get parentTable() { return this._parentTable }

	add(ident: string)
	{
		if (this.table.has(ident))
		{
			console.error('Symbol already defined in current scope')
			return
		}
		// Check if ident is already in the table, if it is this must fail.
		const symbol = new MangroveSymbol(ident)
		this.table.set(ident, symbol)
		return symbol
	}

	insert(symbol: MangroveSymbol) { this.table.set(symbol.value, symbol) }
	findLocal(ident: string) { return this.table.get(ident) }

	find(ident: string): MangroveSymbol | undefined
	{
		const symbol = this.findLocal(ident)
		if (symbol)
			return symbol
		else if (this.parentTable)
			return this.parentTable.find(ident)
		return
	}

	pop(parser: Parser)
	{
		if (this.parentTable)
			parser.symbolTable = this.parentTable
	}
}

export class SymbolStruct
{
	private contents: SymbolTable
	private _members: MangroveSymbol[] = []

	constructor(parser: Parser, members?: MangroveSymbol[])
	{
		this.contents = new SymbolTable(parser)
		if (members)
			this._members = members
	}

	get symbolTable() { return this.contents }
	get members() { return this._members }
}
