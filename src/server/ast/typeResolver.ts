import {SymbolType} from './symbolTable'
import {ASTType, ASTNode} from './types'
import {ASTIdent} from './values'

export class TypeResolver
{
	private resolveExpression(value: ASTNode): SymbolType | undefined
	{
		value
		return
	}

	resolve(value: ASTNode): SymbolType | undefined
	{
		// Handle some of the simple cases first
		if (value.type == ASTType.ident || value.type == ASTType.dottedIdent)
		{
			const symbol = (value as ASTIdent).symbol
			return symbol?.type
		}
		return this.resolveExpression(value)
	}
}
