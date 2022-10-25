import {Ok, Err, Result} from 'ts-results'
import {Position, TextDocument} from 'vscode-languageserver-textdocument'
import {SymbolTable} from '../ast/symbolTable'
import {addBuiltinTypesTo} from '../ast/builtins'
import {ASTIdent, ASTDottedIdent, ASTIdentDef, ASTIndex, ASTSlice, ASTCallArguments} from '../ast/values'
import
{
	ASTBool,
	ASTCharLit,
	ASTFloat,
	ASTInt,
	ASTNull,
	ASTStringLit
} from '../ast/literals'
import {ASTComment, ASTIntType, ASTNode, ASTType} from '../ast/types'
import
{
	ASTFunctionCall,
	ASTPrefixOp,
	ASTPostfixOp,
	ASTDeref,
	ASTInvert,
	ASTMul,
	ASTAdd,
	ASTShift,
	ASTBit,
	ASTRel,
	ASTBetween,
	ASTLogic,
	ASTAssign
} from '../ast/operations'
import {Tokeniser} from './tokeniser'
import {Token, TokenType} from './types'
import {isEquality, isEquals} from './recogniser'
import
{
	ASTNew,
	ASTDelete,
	ASTReturn,
	ASTIfExpr,
	ASTElifExpr,
	ASTElseExpr,
	ASTIfStmt,
	ASTVisibility,
	ASTClass,
	ASTBlock
} from '../ast/statements'

function isInt(token: Token): boolean
{
	return token.typeIsOneOf(
		TokenType.binLit,
		TokenType.octLit,
		TokenType.hexLit,
		TokenType.intLit
	)
}

type ParsingErrors = 'UnreachableState' | 'IncorrectToken' | 'OperatorWithNoRHS' | 'InvalidTokenSequence' |
	'MissingBlock' | 'MissingComma' | 'MissingValue' | 'MissingIndexOrSlice' | 'MissingRightBracket'

function isResultValid<T>(result: Result<T | undefined, ParsingErrors>): result is Ok<T>
{
	return result.ok && result.val != undefined
}

function isResultDefined<T>(result: Result<T | undefined, ParsingErrors>): result is Result<T, ParsingErrors>
{
	return isResultValid(result) || result.err
}

function isResultError<T>(result: Result<T, ParsingErrors>): result is Err<ParsingErrors>
{
	return result.err
}

function isNodeRelation(node: ASTNode | ASTRel): node is ASTRel
{
	return node.type == ASTType.rel
}

type IdentAndComments = {token: Token, comments: ASTNode[]}
type IdentDef = {type?: ASTIdent, ident: ASTIdent}

export class Parser
{
	private lexer: Tokeniser
	private _ident: Token
	private _symbolTable: SymbolTable
	//private _syntaxErrors: SyntaxError[] = []

	constructor(file: TextDocument)
	{
		this.lexer = new Tokeniser(file)
		this._ident = new Token()
		this._symbolTable = new SymbolTable(this)
		addBuiltinTypesTo(this._symbolTable)
	}

	get haveIdent()
	{
		return this._ident.valid
	}

	get symbolTable() { return this._symbolTable }
	set symbolTable(table: SymbolTable) { this._symbolTable = table }

	match(...tokenTypes: TokenType[])
	{
		const token = this.lexer.token
		if (token.typeIsOneOf(...tokenTypes))
		{
			this.lexer.next()
			return this.skipWhite()
		}
		//expected(tokenType, token)
		return undefined
	}

	skipWhite()
	{
		const comments: ASTNode[] = []
		const token = this.lexer.token
		while (token.typeIsOneOf(TokenType.whitespace, TokenType.newline, TokenType.comment))
		{
			if (token.typeIsOneOf(TokenType.comment))
				comments.push(new ASTComment(token))
			this.lexer.next()
		}
		return comments
	}

	parseIdentStr() : Result<IdentAndComments | undefined, ParsingErrors>
	{
		const token = this.lexer.token.clone()
		if (!token.typeIsOneOf(TokenType.ident))
			return Ok(undefined)
		const match = this.match(TokenType.ident)
		if (!match)
			return Err('UnreachableState')
		return Ok({token: token, comments: match})
	}

	parseIdent(): Result<ASTIdent | undefined, ParsingErrors>
	{
		const match = this.parseIdentStr()
		if (!match.ok)
			return match
		const value = match.val
		if (value == undefined)
			return Ok(undefined)
		const {token: ident, comments} = value
		// Do symbol table things.
		const node = new ASTIdent(ident, undefined)
		node.add(comments)
		return Ok(node)
	}

	parseComments()
	{
		const comments: ASTNode[] = []
		const token = this.lexer.token
		while (token.typeIsOneOf(TokenType.comment))
		{
			comments.push(new ASTComment(token))
			this.lexer.next()
		}
		return comments
	}

	parseDottedIdent(): Result<ASTIdent | undefined, ParsingErrors>
	{
		const token = this.lexer.token
		const comments: ASTNode[] = []
		const dottedIdent: Token[] = []
		let haveDot = true
		while (haveDot)
		{
			// Grab the next identifier in the expression
			const ident = token.clone()
			// And ensure that it is an identifier token or dot
			if (!token.typeIsOneOf(TokenType.ident, TokenType.dot))
				return Ok(undefined)//Err('IncorrectToken')
			// If it's an ident
			if (token.typeIsOneOf(TokenType.ident))
			{
				this.lexer.next()
				// Add the newly parsed identifier to the ident list
				dottedIdent.push(ident)
			}
			// Accumulate any comment nodes
			comments.push(...this.parseComments())
			// If there is no dot following the identifier, we're done
			haveDot = token.typeIsOneOf(TokenType.dot)
			if (haveDot)
			{
				// There was a dot, so match on it and add any comments that generates to the comments array
				this.lexer.next()
				// Accumulate any comment nodes
				comments.push(...this.parseComments())
			}
		}
		comments.push(...this.skipWhite())
		if (dottedIdent.length === 1)
		{
			const node = new ASTIdent(dottedIdent[0], undefined)
			node.add(comments)
			return Ok(node)
		}
		const node = new ASTDottedIdent(dottedIdent, [])
		node.add(comments)
		return Ok(node)
	}

	parseBin(): Result<ASTNode, ParsingErrors>
	{
		const node = new ASTInt(ASTIntType.bin, this.lexer.token)
		const match = this.match(TokenType.binLit)
		if (!match)
			return Err('UnreachableState')
		node.add(match)
		return Ok(node)
	}

	parseOct(): Result<ASTNode, ParsingErrors>
	{
		const node = new ASTInt(ASTIntType.oct, this.lexer.token)
		const match = this.match(TokenType.octLit)
		if (!match)
			return Err('UnreachableState')
		node.add(match)
		return Ok(node)
	}

	parseHex(): Result<ASTNode, ParsingErrors>
	{
		const node = new ASTInt(ASTIntType.hex, this.lexer.token)
		const match = this.match(TokenType.hexLit)
		if (!match)
			return Err('UnreachableState')
		node.add(match)
		return Ok(node)
	}

	parseInt(allowFloat = true): Result<ASTNode | undefined, ParsingErrors>
	{
		const token = this.lexer.token
		if (token.typeIsOneOf(TokenType.binLit))
			return this.parseBin()
		else if (token.typeIsOneOf(TokenType.octLit))
			return this.parseOct()
		else if (token.typeIsOneOf(TokenType.hexLit))
			return this.parseHex()
		else if (token.typeIsOneOf(TokenType.intLit))
		{
			const node = new ASTInt(ASTIntType.dec, this.lexer.token)
			this.lexer.next()
			if (allowFloat && token.typeIsOneOf(TokenType.dot))
				return Ok(this.parseFloat(node.token.value, node.token.location.start))
			node.add(this.skipWhite())
			return Ok(node)
		}
		return Ok(undefined)
	}

	parseFloat(intValue: string, tokenStart: Position): ASTNode
	{
		let decValue = ''
		let suffix = ''
		let floatBits = 64
		const token = this.lexer.token
		let tokenEnd = token.location.end
		this.lexer.next()
		if (token.typeIsOneOf(TokenType.intLit))
		{
			decValue = token.value
			tokenEnd = token.location.end
			this.lexer.next()
		}
		if (token.typeIsOneOf(TokenType.ident) && ['f', 'F'].includes(token.value))
		{
			floatBits = 32
			suffix = token.value
			tokenEnd = token.location.end
			this.lexer.next()
		}
		const floatToken = new Token()
		const floatValue = `${intValue}.${decValue}${suffix}`

		if (floatBits === 32)
			floatToken.set(TokenType.float32Lit, floatValue)
		else
			floatToken.set(TokenType.float64Lit, floatValue)

		floatToken.beginsAt(tokenStart)
		floatToken.endsAt(tokenEnd)
		floatToken.calcLength(this.lexer.file)
		const node = new ASTFloat(floatBits, floatToken)
		node.add(this.skipWhite())
		return node
	}

	parseStringLiteral(): Result<ASTNode | undefined, ParsingErrors>
	{
		const token = this.lexer.token
		if (!token.typeIsOneOf(TokenType.stringLit))
			return Ok(undefined)
		const node = new ASTStringLit(token)
		while (token.typeIsOneOf(TokenType.stringLit))
		{
			node.addSegment(token)
			const match = this.match(TokenType.stringLit)
			if (!match)
				return Err('UnreachableState')
			node.add(match)
		}
		return Ok(node)
	}

	parseCharLiteral(): Result<ASTNode, ParsingErrors>
	{
		const node = new ASTCharLit(this.lexer.token)
		const match = this.match(TokenType.charLit)
		if (!match)
			return Err('UnreachableState')
		node.add(match)
		return Ok(node)
	}

	parseBool(): Result<ASTNode | undefined, ParsingErrors>
	{
		const token = this.lexer.token
		if (!token.typeIsOneOf(TokenType.boolLit))
			return Ok(undefined)
		const node = new ASTBool(token)
		const match = this.match(TokenType.boolLit)
		if (!match)
			return Err('UnreachableState')
		node.add(match)
		return Ok(node)
	}

	parseNull(): Result<ASTNode | undefined, ParsingErrors>
	{
		const token = this.lexer.token
		if (!token.typeIsOneOf(TokenType.nullptrLit))
			return Ok(undefined)
		const node = new ASTNull(token)
		const match = this.match(TokenType.nullptrLit)
		if (!match)
			return Err('UnreachableState')
		node.add(match)
		return Ok(node)
	}

	parseConst(): Result<ASTNode | undefined, ParsingErrors>
	{
		const token = this.lexer.token
		if (token.typeIsOneOf(TokenType.invalid))
		{
			console.error('Contant expected, got invalid token instead')
			return Err('IncorrectToken')
		}
		else if (isInt(token))
			return this.parseInt()
		else if (token.typeIsOneOf(TokenType.stringLit))
			return this.parseStringLiteral()
		else if (token.typeIsOneOf(TokenType.charLit))
			return this.parseCharLiteral()
		const bool = this.parseBool()
		if (isResultDefined(bool))
			return bool
		return this.parseNull()
	}

	parseSlice(index: ASTIndex, begin?: ASTNode): Result<ASTNode | undefined, ParsingErrors>
	{
		// Copy the index node's ident and comment data over
		const node = new ASTSlice(index.target, begin)
		node.add(index.children)
		// Check if the next token is a colon (it's fatal if it is not)
		const colon = this.match(TokenType.colon)
		if (!colon)
			return Err('UnreachableState')
		node.add(colon)
		// Now try and parse the end expression for the slice if there is one
		const token = this.lexer.token
		// At this point we either have `[:` or `[begin:` and want to grab the end point
		if (!token.typeIsOneOf(TokenType.rightSquare))
		{
			const expr = this.parseLogicExpr()
			if (!isResultValid(expr))
				return expr
			node.end = expr.val
		}
		// Now we should either have `[:]`, `[begin:]`, `[:end]`, or `[begin:end]`
		const rightSquare = this.match(TokenType.rightSquare)
		if (!rightSquare)
			return Err('MissingRightBracket')
		node.add(rightSquare)
		return Ok(node)
	}

	parseIndex(ident: ASTIdent): Result<ASTNode | undefined, ParsingErrors>
	{
		const token = this.lexer.token
		const node = new ASTIndex(ident)
		const leftSquare = this.match(TokenType.leftSquare)
		if (!leftSquare)
			return Err('UnreachableState')
		node.add(leftSquare)
		let index: ASTNode | undefined
		// Check to see if we just got `[]`
		if (token.typeIsOneOf(TokenType.rightSquare))
			return Err('MissingIndexOrSlice')
		// Parse an indexing expression, as long as it's not `[:`
		else if (!token.typeIsOneOf(TokenType.colon))
		{
			const expr = this.parseLogicExpr()
			if (!isResultValid(expr))
				return expr
			index = expr.val
		}
		// Do we now have either `[:` or `[expr:`?
		if (token.typeIsOneOf(TokenType.colon))
			return /*parseSlice(node, index)*/Ok(undefined)
		if (!index)
			return Err('UnreachableState')
		node.index = index
		// We did not, so we should now have `[expr]` meaning a normal index expression
		const rightSquare = this.match(TokenType.rightSquare)
		if (!rightSquare)
			return Err('MissingRightBracket')
		node.add(rightSquare)
		return Ok(node)
	}

	parseValue(): Result<ASTNode | undefined, ParsingErrors>
	{
		const token = this.lexer.token
		if (this.haveIdent)
		{
			const node = new ASTIdent(this._ident)
			this._ident.reset()
			return Ok(node)
		}
		const const_ = this.parseConst()
		if (isResultDefined(const_))
			return const_
		const ident = this.parseDottedIdent()
		if (isResultValid(ident))
		{
			if (token.typeIsOneOf(TokenType.leftParen))
				return this.parseFunctionCall(ident.val)
			else if (token.typeIsOneOf(TokenType.leftSquare))
				return this.parseIndex(ident.val)
		}
		return ident
	}

	parseCallArgs(): Result<ASTCallArguments | undefined, ParsingErrors>
	{
		const token = this.lexer.token
		const node = new ASTCallArguments(token)
		const leftParen = this.match(TokenType.leftParen)
		if (!leftParen)
			return Err('UnreachableState')
		node.add(leftParen)
		while (!token.typeIsOneOf(TokenType.rightParen))
		{
			const value = this.parseValue()
			if (!isResultValid(value))
				return value as Result<undefined, ParsingErrors>
			node.addArgument(value.val)
			if (!token.typeIsOneOf(TokenType.rightParen))
			{
				const comma = this.match(TokenType.comma)
				if (!comma)
					return Err('MissingComma')
				else if (token.typeIsOneOf(TokenType.rightParen))
					return Err('MissingValue')
				node.add(comma)
			}
		}
		node.adjustEnd(token, this.lexer.file)
		const rightParen = this.match(TokenType.rightParen)
		if (!rightParen)
			return Err('UnreachableState')
		node.add(rightParen)
		return Ok(node)
	}

	parseFunctionCall(func: ASTIdent): Result<ASTFunctionCall | undefined, ParsingErrors>
	{
		const args = this.parseCallArgs()
		if (!isResultValid(args))
			return args as Result<undefined, ParsingErrors>
		return Ok(new ASTFunctionCall(func, args.val))
	}

	parseIncExpr(): Result<ASTNode | undefined, ParsingErrors>
	{
		const token = this.lexer.token
		if (!this.haveIdent && token.typeIsOneOf(TokenType.incOp))
		{
			const op = token.clone()
			const match = this.match(TokenType.incOp)
			if (!match)
				return Err('UnreachableState')
			const value = this.parseValue()
			if (!isResultDefined(value))
				return Err('OperatorWithNoRHS')
			if (isResultError(value))
				return value
			const node = new ASTPrefixOp(op, value.val)
			node.add(match)
			return Ok(node)
		}
		const value = this.parseValue()
		if (!isResultValid(value))
			return value
		if (token.typeIsOneOf(TokenType.incOp))
		{
			const op = token.clone()
			const match = this.match(TokenType.incOp)
			if (!match)
				return Err('UnreachableState')
			const node = new ASTPostfixOp(op, value.val)
			node.add(match)
			return Ok(node)
		}
		return value
	}

	parseDerefExpr(): Result<ASTNode | undefined, ParsingErrors>
	{
		const token = this.lexer.token
		if (!this.haveIdent && token.typeIsOneOf(TokenType.mulOp))
		{
			if (token.value !== '*')
				return Err('IncorrectToken')
			const op = token.clone()
			const match = this.match(TokenType.mulOp)
			if (!match)
				return Err('UnreachableState')
			const value = this.parseIncExpr()
			if (!isResultDefined(value))
				return Err('OperatorWithNoRHS')
			if (isResultError(value))
				return value
			const node = new ASTDeref(op, value.val)
			node.add(match)
			return Ok(node)
		}
		return this.parseIncExpr()
	}

	parseInvertExpr(): Result<ASTNode | undefined, ParsingErrors>
	{
		if (this.haveIdent)
			return this.parseIncExpr()
		const token = this.lexer.token
		if (token.typeIsOneOf(TokenType.invert))
		{
			const op = token.clone()
			const match = this.match(TokenType.invert)
			if (!match)
				return Err('UnreachableState')
			const value = this.parseDerefExpr()
			if (!isResultDefined(value))
				return Err('OperatorWithNoRHS')
			if (isResultError(value))
				return value
			const node = new ASTInvert(op, value.val)
			node.add(match)
			return Ok(node)
		}
		else if (token.typeIsOneOf(TokenType.addOp))
		{
			if (token.value !== '-')
				return Err('IncorrectToken')
			const op = token.clone()
			const match = this.match(TokenType.addOp)
			if (!match)
				return Err('UnreachableState')
			const value = this.parseDerefExpr()
			if (!isResultDefined(value))
				return Err('OperatorWithNoRHS')
			if (isResultError(value))
				return value
			const node = new ASTInvert(op, value.val)
			node.add(match)
			return Ok(node)
		}
		return this.parseDerefExpr()
	}

	parseBinaryExpr<ASTNodeType extends ASTNode>(valueFn: () => Result<ASTNode | undefined, ParsingErrors>,
		tokenType: TokenType, nodeType: {new(lhs: ASTNode, op: Token, rhs: ASTNode): ASTNodeType}):
		Result<ASTNode | undefined, ParsingErrors>
	{
		const value = valueFn.call(this)
		if (!isResultValid(value))
			return value
		const token = this.lexer.token
		let lhs = value.val
		while (token.typeIsOneOf(tokenType))
		{
			const op = token.clone()
			const match = this.match(tokenType)
			if (!match)
				return Err('UnreachableState')
			const rhs = valueFn.call(this)
			if (!isResultDefined(rhs))
				return Err('OperatorWithNoRHS')
			if (isResultError(rhs))
				return rhs
			lhs = new nodeType(lhs, op, rhs.val)
		}
		return Ok(lhs)
	}

	parseMulExpr() { return this.parseBinaryExpr(this.parseInvertExpr, TokenType.mulOp, ASTMul) }
	parseAddExpr() { return this.parseBinaryExpr(this.parseMulExpr, TokenType.addOp, ASTAdd) }

	parseShiftExpr(): Result<ASTNode | ASTRel | undefined, ParsingErrors>
	{
		const lhs = this.parseAddExpr()
		if (!isResultValid(lhs))
			return lhs
		const token = this.lexer.token
		if (!token.typeIsOneOf(TokenType.shiftOp))
			return lhs
		const op = token.clone()
		const match = this.match(TokenType.shiftOp)
		if (!match)
			return Err('UnreachableState')
		const rhs = this.parseAddExpr()
		if (!isResultDefined(rhs))
			return Err('OperatorWithNoRHS')
		if (isResultError(rhs))
			return rhs
		const node = new ASTShift(lhs.val, op, rhs.val)
		node.add(match)
		return Ok(node)
	}

	parseBitExpr() { return this.parseBinaryExpr(this.parseShiftExpr, TokenType.bitOp, ASTBit) }

	parseRelExpr(): Result<ASTNode | ASTRel | undefined, ParsingErrors>
	{
		const lhs = this.parseBitExpr()
		const token = this.lexer.token
		if (!isResultValid(lhs) || !token.typeIsOneOf(TokenType.relOp, TokenType.equOp))
			return lhs
		const op = token.clone()
		const match = this.match(TokenType.relOp, TokenType.equOp)
		if (!match)
			return Err('UnreachableState')
		const rhs = this.parseBitExpr()
		if (!isResultDefined(rhs))
			return Err('OperatorWithNoRHS')
		if (isResultError(rhs))
			return rhs
		const node = new ASTRel(lhs.val, op, rhs.val)
		node.add(match)
		return Ok(node)
	}

	parseBetweenExpr(relation: ASTRel): Result<ASTNode | undefined, ParsingErrors>
	{
		if (!relation.valid)
			return Err('UnreachableState')
		else if (!isEquality(relation.op))
			return Err('IncorrectToken')
		const rhsOp = this.lexer.token.clone()
		const lhsOp = relation.op
		if (rhsOp.value[0] != lhsOp[0])
			return Err('IncorrectToken')
		const match = this.match(TokenType.relOp)
		if (!match)
			return Err('UnreachableState')
		const rhs = this.parseRelExpr()
		if (!isResultDefined(rhs))
			return Err('OperatorWithNoRHS')
		if (isResultError(rhs))
			return rhs
		const node = new ASTBetween(relation, rhsOp, rhs.val)
		node.add(match)
		return Ok(node)
	}

	parseRelation(): Result<ASTNode | undefined, ParsingErrors>
	{
		const lhs = this.parseRelExpr()
		if (!isResultValid(lhs))
			return lhs
		if (!isNodeRelation(lhs.val))
			return lhs
		if (lhs.val.rhs.type == ASTType.ident)
		{
			const token = this.lexer.token
			if (token.typeIsOneOf(TokenType.relOp))
				return this.parseBetweenExpr(lhs.val)
			else if (token.typeIsOneOf(TokenType.equOp))
				return Err('InvalidTokenSequence')
		}
		return lhs
	}

	parseLogicExpr(): Result<ASTNode | undefined, ParsingErrors>
	{
		const relation = this.parseRelation()
		if (!isResultValid(relation))
			return relation
		const token = this.lexer.token
		let lhs = relation.val
		while (token.typeIsOneOf(TokenType.logicOp))
		{
			const op = token.clone()
			const match = this.match(TokenType.logicOp)
			if (!match)
				return Err('UnreachableState')
			const rhs = this.parseRelation()
			if (!isResultDefined(rhs))
				return Err('OperatorWithNoRHS')
			if (isResultError(rhs))
				return rhs
			lhs = new ASTLogic(lhs, op, rhs.val)
			lhs.add(match)
		}
		return Ok(lhs)
	}

	parseNewExpr(): Result<ASTNode | undefined, ParsingErrors>
	{
		const token = this.lexer.token.clone()
		if (!token.typeIsOneOf(TokenType.newStmt))
			return Ok(undefined)
		const match = this.match(TokenType.newStmt)
		if (!match)
			return Err('UnreachableState')
		const ident = this.parseDottedIdent()
		if (!isResultDefined(ident))
			return Err('OperatorWithNoRHS')
		if (isResultError(ident))
			return ident
		const call = this.parseFunctionCall(ident.val)
		if (!isResultDefined(call))
			return Err('InvalidTokenSequence')
		if (isResultError(call))
			return call
		const node = new ASTNew(token, call.val)
		node.add(match)
		return Ok(node)
	}

	parseDeleteExpr(): Result<ASTNode | undefined, ParsingErrors>
	{
		const token = this.lexer.token.clone()
		const match = this.match(TokenType.deleteStmt)
		if (!match)
			return Err('UnreachableState')
		const ident = this.parseDottedIdent()
		if (!isResultDefined(ident))
			return Err('OperatorWithNoRHS')
		if (isResultError(ident))
			return ident
		const node = new ASTDelete(token, ident.val)
		node.add(match)
		return Ok(node)
	}

	parseValueExpr(): Result<ASTNode | undefined, ParsingErrors>
	{
		const value = this.parseLogicExpr()
		if (!isResultDefined(value))
			return this.parseNewExpr()
		return value
	}

	parseReturnExpr(): Result<ASTNode | undefined, ParsingErrors>
	{
		const token = this.lexer.token.clone()
		const match = this.match(TokenType.returnStmt)
		if (!match)
			return Err('UnreachableState')
		const value = this.parseValueExpr()
		if (!isResultDefined(value))
			return Err('OperatorWithNoRHS')
		if (isResultError(value))
			return value
		const node = new ASTReturn(token, value.val)
		node.add(match)
		return Ok(node)
	}

	parseTypeDef(): Result<ASTIdent | undefined, ParsingErrors>
	{
		// TODO: handle storage and location specs
		const typeIdent = this.parseIdent()
		if (!isResultValid(typeIdent))
			return typeIdent
		// TODO: test to make sure typeIdent refers to a type identifier and not a value variable
		return typeIdent
	}

	parseIdentDef(): Result<IdentDef | undefined, ParsingErrors>
	{
		const type = this.parseTypeDef()
		if (!isResultDefined(type))
			return Ok(undefined)
		if (isResultError(type))
			return type
		const ident = this.parseIdent()
		if (!isResultDefined(ident))
		{
			//return Err('InvalidTokenSequence')
			this._ident = type.val.token
			return Ok(undefined)
		}
		if (isResultError(ident))
			return ident
		return Ok({type: type.val, ident: ident.val})
	}

	parseTargetIdent(): Result<IdentDef | undefined, ParsingErrors>
	{
		const identDef = this.parseIdentDef()
		if (isResultDefined(identDef))
			return identDef
		const dottedIdent = this.parseDottedIdent()
		if (!isResultDefined(dottedIdent))
			return Ok(undefined)
		if (isResultError(dottedIdent))
			return dottedIdent
		return Ok({ident: dottedIdent.val})
	}

	parseAssignExpr(): Result<ASTNode | undefined, ParsingErrors>
	{
		const targetIdent = this.parseTargetIdent()
		if (!isResultDefined(targetIdent))
			return Ok(undefined)
		if (isResultError(targetIdent))
			return targetIdent
		const {type, ident} = targetIdent.val
		const token = this.lexer.token
		if (!token.typeIsOneOf(TokenType.assignOp))
		{
			if (!type)
				return Ok(ident)
			return Ok(new ASTIdentDef(type, ident))
		}
		if (!isEquals(token.value))
		{
			if (type)
				return Err('InvalidTokenSequence')
			return /*this.parseAssignOpExpr(ident)*/Ok(ident)
		}
		const target = type ? new ASTIdentDef(type, ident) : ident
		const op = token.clone()
		const match = this.match(TokenType.assignOp)
		if (!match)
			return Err('UnreachableState')
		const value = this.parseValueExpr()
		if (!isResultDefined(value))
			return Err('OperatorWithNoRHS')
		if (isResultError(value))
			return value
		const node = new ASTAssign(op, target, value.val)
		node.add(match)
		return Ok(node)
	}

	parseExpression(): Result<ASTNode | undefined, ParsingErrors>
	{
		// XXX: This needs to be restructured as a process that deals with ASTNodes instead of nested generators.
		const expr = ((): Result<ASTNode | undefined, ParsingErrors> =>
		{
			const token = this.lexer.token
			if (token.typeIsOneOf(TokenType.deleteStmt))
				return this.parseDeleteExpr()
			if (token.typeIsOneOf(TokenType.returnStmt))
				return this.parseReturnExpr()
			const expr = this.parseAssignExpr()
			if (isResultDefined(expr))
				return expr
			return this.parseLogicExpr()
		})()
		if (!isResultValid(expr))
			return expr
		const node = expr.val
		const token = this.lexer.token
		if (token.typeIsOneOf(TokenType.semi))
		{
			const match = this.match(TokenType.semi)
			if (!match)
				return Err('UnreachableState')
			node.add(match)
		}
		return expr
	}

	parseIfExpr(): Result<ASTIfExpr | undefined, ParsingErrors>
	{
		const token = this.lexer.token.clone()
		if (!token.typeIsOneOf(TokenType.ifStmt))
			return Ok(undefined)
		const match = this.match(TokenType.ifStmt)
		if (!match)
			return Err('UnreachableState')
		const cond = this.parseLogicExpr()
		if (!isResultValid(cond))
			return cond as Result<undefined, ParsingErrors>
		const block = this.parseBlock()
		if (!isResultDefined(block))
			return Err('MissingBlock')
		else if (isResultError(block))
			return block
		const node = new ASTIfExpr(token, cond.val, block.val)
		node.add(match)
		return Ok(node)
	}

	parseElifExpr(): Result<ASTElifExpr | undefined, ParsingErrors>
	{
		const token = this.lexer.token.clone()
		if (!token.typeIsOneOf(TokenType.elifStmt))
			return Ok(undefined)
		const match = this.match(TokenType.elifStmt)
		if (!match)
			return Err('UnreachableState')
		const cond = this.parseLogicExpr()
		if (!isResultValid(cond))
			return cond as Result<undefined, ParsingErrors>
		const block = this.parseBlock()
		if (!isResultDefined(block))
			return Err('MissingBlock')
		else if (isResultError(block))
			return block
		const node = new ASTElifExpr(token, cond.val, block.val)
		node.add(match)
		return Ok(node)
	}

	parseElseExpr(): Result<ASTElseExpr | undefined, ParsingErrors>
	{
		const token = this.lexer.token.clone()
		if (!token.typeIsOneOf(TokenType.elseStmt))
			return Ok(undefined)
		const match = this.match(TokenType.elseStmt)
		if (!match)
			return Err('UnreachableState')
		const block = this.parseBlock()
		if (!isResultDefined(block))
			return Err('MissingBlock')
		else if (isResultError(block))
			return block
		const node = new ASTElseExpr(token, block.val)
		node.add(match)
		return Ok(node)
	}

	parseIfStmt(): Result<ASTNode | undefined, ParsingErrors>
	{
		const ifExpr = this.parseIfExpr()
		if (!isResultValid(ifExpr))
			return ifExpr
		const elifExprs: ASTElifExpr[] = []
		/*eslint no-constant-condition: ["error", { "checkLoops": false }]*/
		while (true)
		{
			const elifExpr = this.parseElifExpr()
			if (!isResultDefined(elifExpr))
				break
			if (isResultError(elifExpr))
				return elifExpr
			elifExprs.push(elifExpr.val)
		}
		const elseExpr = this.parseElseExpr()
		if (isResultError(elseExpr))
			return elseExpr
		return Ok(new ASTIfStmt(ifExpr.val, elifExprs, elseExpr.val))
	}

	parseClassDef(): Result<ASTNode | undefined, ParsingErrors>
	{
		const token = this.lexer.token.clone()
		const match = this.match(TokenType.classDef)
		if (!match)
			return Err('UnreachableState')
		const ident = this.parseIdent()
		if (!isResultDefined(ident))
			return Err('InvalidTokenSequence')
		if (isResultError(ident))
			return ident
		//ident.val.symbol.allocStruct(this)
		const block = this.parseBlock()
		if (!isResultDefined(block))
			return Err('MissingBlock')
		if (isResultError(block))
			return block
		const node = new ASTClass(token, ident.val, block.val)
		node.add(match)
		return Ok(node)
	}

	parseDefine(): Result<ASTNode | undefined, ParsingErrors>
	{
		const token = this.lexer.token
		if (token.typeIsOneOf(TokenType.classDef))
			return this.parseClassDef()
		return Ok(undefined)
	}

	parseStatement(): Result<ASTNode | undefined, ParsingErrors>
	{
		let stmt: Result<ASTNode | undefined, ParsingErrors> = Ok(undefined)
		if (!isResultValid(stmt))
			stmt = this.parseIfStmt()
		if (!isResultValid(stmt))
			stmt = this.parseDefine()
		if (!isResultValid(stmt))
			stmt = this.parseExpression()
		return stmt
	}

	parseVisibility(): Result<ASTNode | undefined, ParsingErrors>
	{
		const token = this.lexer.token
		if (!token.typeIsOneOf(TokenType.visibility))
			return Ok(undefined)
		const node = new ASTVisibility(token)
		const match = this.match(TokenType.visibility)
		if (!match)
			return Err('UnreachableState')
		node.add(match)
		const semicolonMatch = this.match(TokenType.semi)
		if (semicolonMatch !== undefined)
			node.add(semicolonMatch)
		return Ok(node)
	}

	parseBraceBlock(): Result<ASTNode | undefined, ParsingErrors>
	{
		const token = this.lexer.token
		if (!token.typeIsOneOf(TokenType.leftBrace))
			return this.parseStatement()
		const node = new ASTBlock(token)
		const leftBrace = this.match(TokenType.leftBrace)
		if (!leftBrace)
			return Err('UnreachableState')
		node.add(leftBrace)
		while (!token.typeIsOneOf(TokenType.rightBrace))
		{
			const stmt = this.parseStatement()
			if (!isResultValid(stmt))
				return stmt
			node.addStatement(stmt.val)
		}
		node.adjustEnd(token, this.lexer.file)
		const rightBrace = this.match(TokenType.rightBrace)
		if (!rightBrace)
			return Err('UnreachableState')
		node.add(rightBrace)
		return Ok(node)
	}

	parseBlock(): Result<ASTNode | undefined, ParsingErrors>
	{
		return this.parseBraceBlock()
	}

	parseExtStatement(): Result<ASTNode | undefined, ParsingErrors>
	{
		const stmt = this.parseVisibility()
		if (isResultDefined(stmt))
			return stmt
		return this.parseStatement()
	}

	public parse(): ASTNode[]
	{
		const token = this.lexer.next()
		const nodes = this.skipWhite()
		while (!token.typeIsOneOf(TokenType.eof))
		{
			const stmt = this.parseExtStatement()
			if (!isResultDefined(stmt))
			{
				this.lexer.next()
				continue
			}
			if (isResultValid(stmt))
				nodes.push(stmt.val)
			else
				console.error(`Error during parsing: ${stmt.val} at ` +
					`${token.location.start.line}:${token.location.start.character}`)
		}
		return nodes
	}
}
