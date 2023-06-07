import {ASTBool, ASTInt, ASTStringLit} from '../src/server/ast/literals'
import {ASTBlock, ASTClass, ASTParameter, ASTParams, ASTReturn, ASTTemplate} from '../src/server/ast/statements'
import {MangroveSymbol, SymbolType, SymbolTypes} from '../src/server/ast/symbolTable'
import {ASTIntType, ASTNode} from '../src/server/ast/types'
import
{
	ASTCallArguments,
	ASTDottedIdent,
	ASTIdent,
	ASTIdentDef,
	ASTTemplateArguments,
	ASTTypeDecl,
} from '../src/server/ast/values'
import {Parser} from '../src/server/parser/parser'
import {Token, TokenType} from '../src/server/parser/types'

export function astIdent(ident: string, symbol?: SymbolTypes, type?: TokenType)
{
	return new ASTIdent(
		Token.from(type ?? TokenType.ident, ident),
		symbol === undefined ? undefined : new MangroveSymbol(ident, new SymbolType(symbol)),
	)
}

export function astIdentDef(type: string, ident: string, symbol: SymbolTypes)
{
	return new ASTIdentDef(
		new ASTTypeDecl(
			new ASTIdent(Token.from(TokenType.ident, type)),
		),
		astIdent(ident, symbol),
	)
}

export function stringLit(value: string)
{
	return new ASTStringLit(Token.from(TokenType.stringLit, value))
}

export function astTemplateArgs(args: ASTNode[])
{
	const tmplArgs = new ASTTemplateArguments(Token.from(TokenType.relOp, '<'))
	for (const arg of args)
		tmplArgs.addArgument(arg)
	return tmplArgs
}

export function astDottedIdent(idents: string[], symbolSeq: (MangroveSymbol | undefined)[] = [])
{
	return new ASTDottedIdent(
		idents.map(ident => Token.from(TokenType.ident, ident)),
		symbolSeq,
	)
}

export function astReturn(expr: ASTNode)
{
	return new ASTReturn(
		Token.from(TokenType.returnStmt, 'return'),
		expr,
	)
}

export function astInt(val: string, type: ASTIntType = ASTIntType.dec)
{
	return new ASTInt(type, Token.from(TokenType.intLit, val))
}

export function astBool(val: 'true' | 'false')
{
	return new ASTBool(Token.from(TokenType.boolLit, val))
}

export function astTypeDecl(value: string, type: TokenType = TokenType.ident)
{
	return new ASTTypeDecl(new ASTIdent(Token.from(type, value)))
}

export function astParams(params: ASTParameter[] = [])
{
	const astParams = new ASTParams(Token.from(TokenType.leftParen))
	for (const param of params)
		astParams.addParameter(param)
	return astParams
}

export function astCallArgs(args: ASTNode[] = [])
{
	const callArgs = new ASTCallArguments(Token.from(TokenType.leftParen))
	for (const arg of args)
		callArgs.addArgument(arg)
	return callArgs
}

export function astBlock(parser: Parser, statements: ASTNode[] = [])
{
	const block = new ASTBlock(Token.from(TokenType.leftBrace), parser)
	for (const statement of statements)
		block.addStatement(statement)
	return block
}

export function astTemplate(parser: Parser, params: ASTIdentDef[] = [])
{
	const astTemplate = new ASTTemplate(Token.from(TokenType.relOp, '<'), parser)
	for (const param of params)
		astTemplate.addParameter(param)
	return astTemplate
}

export function astClass(ident: string, block: ASTNode)
{
	return new ASTClass(
		Token.from(TokenType.classDef, 'class'),
		astIdent(ident, SymbolTypes.struct | SymbolTypes.type),
		undefined,
		block,
	)
}
