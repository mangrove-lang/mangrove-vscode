import {MangroveSymbol, SymbolTable, SymbolType, SymbolTypes} from './symbolTable'

const builtinTypes =
[
	new MangroveSymbol('type', new SymbolType(SymbolTypes.type)),
	new MangroveSymbol('none', new SymbolType(SymbolTypes.type | SymbolTypes.none)),
	new MangroveSymbol('Bool', new SymbolType(SymbolTypes.type | SymbolTypes.bool)),
	new MangroveSymbol('Int8', new SymbolType(SymbolTypes.type | SymbolTypes.signed | SymbolTypes.int8Bit)),
	new MangroveSymbol('Int16', new SymbolType(SymbolTypes.type | SymbolTypes.signed | SymbolTypes.int16Bit)),
	new MangroveSymbol('Int32', new SymbolType(SymbolTypes.type | SymbolTypes.signed | SymbolTypes.int32Bit)),
	new MangroveSymbol('Int64', new SymbolType(SymbolTypes.type | SymbolTypes.signed | SymbolTypes.int64Bit)),
	new MangroveSymbol('UInt8', new SymbolType(SymbolTypes.type | SymbolTypes.unsigned | SymbolTypes.int8Bit)),
	new MangroveSymbol('UInt16', new SymbolType(SymbolTypes.type | SymbolTypes.unsigned | SymbolTypes.int16Bit)),
	new MangroveSymbol('UInt32', new SymbolType(SymbolTypes.type | SymbolTypes.unsigned | SymbolTypes.int32Bit)),
	new MangroveSymbol('UInt64', new SymbolType(SymbolTypes.type | SymbolTypes.unsigned | SymbolTypes.int64Bit)),
	new MangroveSymbol('Char', new SymbolType(SymbolTypes.type | SymbolTypes.character)),
	new MangroveSymbol('String', new SymbolType(SymbolTypes.type | SymbolTypes.string)),
	new MangroveSymbol('List', new SymbolType(SymbolTypes.type | SymbolTypes.list)),
	new MangroveSymbol('Array', new SymbolType(SymbolTypes.type | SymbolTypes.array)),
	new MangroveSymbol('Dict', new SymbolType(SymbolTypes.type | SymbolTypes.dict)),
	new MangroveSymbol('Set', new SymbolType(SymbolTypes.type | SymbolTypes.set)),
] as const

export function addBuiltinTypesTo(symbolTable: SymbolTable)
{
	for (const type of builtinTypes)
		symbolTable.insert(type)
}
