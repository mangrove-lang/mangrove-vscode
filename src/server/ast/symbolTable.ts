let symbolTable: SymbolTable | undefined

export enum SymbolTypes
{
	isInteger = 0x01,
	isUnsigned = 0x03,
	int8Bit = 0x00,
	int16Bit = 0x04,
	int32Bit = 0x08,
	int64Bit = 0x0C,
	isCharacter = 0x10,
	isList = 0x20,
	isString = 0x30,
	isStruct = 0x40,
	isDict = 0x60,
	invalid = 0xFF
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
	mask(type: SymbolTypes) { return this.type & type }
	isEqual(symbolType: SymbolType) { return this.type == symbolType.type }

	get isInvalid() { return this.type == SymbolTypes.invalid }
}

export class Symbol
{
	private readonly _ident?: string
	private _type: SymbolType = new SymbolType()
	private _struct?: SymbolStruct

	constructor(ident?: string)
	{
		this._ident = ident
	}

	allocStruct()
	{
		this._struct = new SymbolStruct()
		this._type.assign(SymbolTypes.isStruct)
	}

	isEqual(symbol: Symbol) { return this._ident === symbol._ident && this._type.isEqual(symbol._type) }

	get value() { return this._ident }
	set type(type: SymbolType) { this._type = type }
	get type() { return this._type }
	get structure() { return this._struct }
}

export class SymbolTable
{
	private parentTable?: SymbolTable
	private table: Map<string, Symbol> = new Map<string, Symbol>()

	constructor()
	{
		this.parentTable = symbolTable
		symbolTable = this
	}

	add(ident: string)
	{
		if (this.table.has(ident))
		{
			console.error('Symbol already defined in current scope')
			return
		}
		// Check if ident is already in the table, if it is this must fail.
		const symbol = new Symbol(ident)
		this.table.set(ident, symbol)
		return symbol
	}

	findLocal(ident: string) { return this.table.get(ident) }

	find(ident: string): Symbol | undefined
	{
		const symbol = this.findLocal(ident)
		if (symbol)
			return symbol
		else if (this.parentTable)
			return this.parentTable.find(ident)
		return
	}

	pop() { symbolTable = this.parentTable }
}

export class SymbolStruct
{
	private contents: SymbolTable = new SymbolTable()
	private members: Symbol[] = new Array<Symbol>()

	constructor(members?: Symbol[])
	{
		if (members)
			this.members.push(...members)
	}

	get symbolTable() { return this.contents }
}
