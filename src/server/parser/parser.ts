import {Ok, Err, Result} from 'ts-results'
import {Position, TextDocument} from 'vscode-languageserver-textdocument'
import {MangroveSymbol, SymbolTable, SymbolType, SymbolTypes} from '../ast/symbolTable'
import {addBuiltinTypesTo} from '../ast/builtins'
import
{
	ASTIdent,
	ASTDottedIdent,
	ASTStorage,
	ASTTypeDecl,
	ASTIdentDef,
	ASTIndex,
	ASTSlice,
	ASTCallArguments
} from '../ast/values'
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
import
{
	isConst,
	isEquality,
	isEquals,
	isStatic,
	isVolatile,
	isBeginTmpl,
	isEndTmpl
} from './recogniser'
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
	ASTParams,
	ASTReturnType,
	ASTTemplate,
	ASTFunction,
	ASTOperator,
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
	'MissingBlock' | 'MissingComma' | 'MissingValue' | 'MissingIndexOrSlice' | 'MissingRightBracket' |
	'MissingParams' | 'MissingReturnType' | 'InvalidAssignment' | 'SymbolAlreadyDefined'

function isResultValid<T>(result: Result<T | undefined, ParsingErrors>): result is Ok<T>
{
	return result.ok && result.val !== undefined
}

function isResultInvalid<T>(result: Result<T | undefined, ParsingErrors>): result is Ok<undefined>
{
	return result.ok && result.val === undefined
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
	private _ident?: ASTIdent
	private _symbolTable: SymbolTable
	//private _syntaxErrors: SyntaxError[] = []

	constructor(file: TextDocument)
	{
		this.lexer = new Tokeniser(file)
		this._symbolTable = new SymbolTable(this)
		addBuiltinTypesTo(this._symbolTable)
	}

	private get ident()
	{
		const ident = this._ident
		this._ident = undefined
		return ident
	}

	private get haveIdent() { return this._ident && this._ident.valid }
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

	parseIdentStr() : Result<IdentAndComments | undefined, ParsingErrors>
	{
		const token = this.lexer.token.clone()
		if (!token.typeIsOneOf(TokenType.ident))
			return Ok(undefined)
		this.lexer.next()
		const comments = this.parseComments()
		if (token.typeIsOneOf(TokenType.dot))
			return Err('InvalidTokenSequence')
		comments.push(...this.skipWhite())
		return Ok({token: token, comments: comments})
	}

	parseIdent(): Result<ASTIdent | undefined, ParsingErrors>
	{
		// If we have an identifier in look-aside storage, pick that rather than parsing a new one.
		if (this.haveIdent)
			return Ok(this.ident)
		// Otherwise try and parse a new identifier
		const match = this.parseIdentStr()
		if (!match.ok)
			return match
		const value = match.val
		if (value == undefined)
			return Ok(undefined)
		const {token: ident, comments} = value
		const symbol = this.symbolTable.find(ident.value)
		console.info(`Looked up ${ident}, found symbol ${symbol}`)
		const node = new ASTIdent(ident, symbol)
		node.add(comments)
		return Ok(node)
	}

	lookupIdentSymbolFromChain(ident: string, symbols: (MangroveSymbol | undefined)[]): MangroveSymbol | undefined
	{
		if (symbols.length)
		{
			const struct = symbols[symbols.length - 1]?.structure
			return struct?.symbolTable.findLocal(ident)
		}
		else
			return this.symbolTable.find(ident)
	}

	parseDottedIdent(): Result<ASTIdent | undefined, ParsingErrors>
	{
		if (this.haveIdent)
			return Ok(this.ident)
		const token = this.lexer.token
		const comments: ASTNode[] = []
		const dottedIdent: Token[] = []
		const symbols: (MangroveSymbol | undefined)[] = []
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
				const symbol = this.lookupIdentSymbolFromChain(ident.value, symbols)
				console.info(`Looked up ${ident}, found symbol ${symbol}`)
				symbols.push(symbol)
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
			const node = new ASTIdent(dottedIdent[0], symbols[0])
			node.add(comments)
			return Ok(node)
		}
		const node = new ASTDottedIdent(dottedIdent, symbols)
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
		node.add(index.comments)
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
			return Ok(this.ident)
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
			// Assertion required because tsc can't work out that undefined isn't in the valid set after this.
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

	parseConstSpec(): Result<ASTStorage | undefined, ParsingErrors>
	{
		const token = this.lexer.token
		if (!token.typeIsOneOf(TokenType.storageSpec) || !isConst(token.value))
			return Ok(undefined)
		const constToken = token.clone()
		const match = this.match(TokenType.storageSpec)
		if (!match)
			return Err('UnreachableState')
		const node = new ASTStorage(constToken)
		node.add(match)
		return Ok(node)
	}

	parseCVSpec(volatileValid = true): Result<ASTStorage | undefined, ParsingErrors>
	{
		const spec = this.parseConstSpec()
		if (!isResultValid(spec) || !volatileValid)
			return spec
		const token = this.lexer.token
		if (!token.typeIsOneOf(TokenType.storageSpec) || !isVolatile(token.value))
			return spec
		const storageSpec = spec.val
		storageSpec.volatileSpec = token.clone()
		const match = this.match(TokenType.storageSpec)
		if (!match)
			return Err('UnreachableState')
		storageSpec.add(match)
		return spec
	}

	parseStorageSpec(volatileValid = true): Result<ASTStorage | undefined, ParsingErrors>
	{
		const token = this.lexer.token
		if (!token.typeIsOneOf(TokenType.storageSpec))
			return Ok(undefined)
		let comments: ASTNode[] = []
		const staticToken = isStatic(token.value) ? token.clone() : undefined
		if (staticToken)
		{
			const match = this.match(TokenType.storageSpec)
			if (!match)
				return Err('UnreachableState')
			comments = match
		}
		const storageSpec = this.parseCVSpec(volatileValid)
		if (isResultError(storageSpec))
			return storageSpec
		const node = storageSpec.val ?? new ASTStorage()
		node.staticSpec = staticToken
		node.add(comments)
		return Ok(node)
	}

	parseTypeDecl(locationValid = true): Result<ASTTypeDecl | undefined, ParsingErrors>
	{
		// First try to get any storage specification modifiers
		const storageSpec = this.parseStorageSpec()
		if (isResultError(storageSpec))
			return storageSpec
		if (locationValid)
		{
			// TODO: parse location specifications
		}
		// If we didn't error, now try and get a type
		const typeIdent = this.parseIdent()
		// If we have storage specifiers and do not have an identifier, that's a failure
		if (storageSpec.val && !isResultDefined(typeIdent))
			return Err('InvalidTokenSequence')
		if (isResultInvalid(typeIdent) || isResultError(typeIdent))
			return typeIdent
		// This literally only exists to fix TS's type assertions as it can't figure out
		// that `Ok<ASTIdent>` is the only possible type for typeIdent after the previous if.
		if (!isResultDefined(typeIdent))
			return Err('UnreachableState')
		const symbol = typeIdent.val.symbol?.clone()
		// So far we've parsed `<storageSpec> <locationSpec> <type>`, now see if we have a ref or pointer.
		const token = this.lexer.token
		if (token.typeIsOneOf(TokenType.bitOp) && token.value == '&')
		{
			const match = this.match(TokenType.bitOp)
			if (!match)
				return Err('UnreachableState')
			typeIdent.val.add(match)
			symbol?.type.append(SymbolTypes.reference)
		}
		typeIdent.val.symbol = symbol
		// Check if the identifier is a type ident
		if (symbol?.isType)
			return Ok(new ASTTypeDecl(typeIdent.val, storageSpec.val))
		// If it is not or we can't tell, push it over to the look-aside storage and gracefully fail
		this._ident = typeIdent.val
		return Ok(undefined)
	}

	parseIdentDef(): Result<IdentDef | undefined, ParsingErrors>
	{
		const type = this.parseTypeDecl()
		if (!isResultDefined(type))
			return Ok(undefined)
		if (isResultError(type))
			return type
		const typeSymbol = type.val.symbol
		if (!typeSymbol)
			return Err('UnreachableState')
		const ident = this.parseIdent()
		if (!isResultDefined(ident))
			return Err('InvalidTokenSequence')
		if (isResultError(ident))
			return ident
		const symbol = this.symbolTable.add(ident.val.value)
		if (!symbol)
			return Err('SymbolAlreadyDefined')
		symbol.type = typeSymbol.type.forValue()
		ident.val.symbol = symbol
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
		// If we're assigning to something of the form `type T = `, ensure
		// the value to assign is a type and copy its type over
		if (target.symbol?.type.isEqual(SymbolTypes.type))
		{
			if (value.val.type !== ASTType.ident)
				return Err('InvalidAssignment')
			const typeIdent = value.val as ASTIdent
			const symbol = typeIdent.symbol
			if (!symbol)
				return Err('UnreachableState')
			target.symbol.type = symbol.type
		}
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
		const match = this.match(TokenType.semi)
		if (match)
			node.add(match)
		return expr
	}

	parseIfExpr(): Result<ASTIfExpr | undefined, ParsingErrors>
	{
		const token = this.lexer.token.clone()
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
		for (let elifExpr = this.parseElifExpr(); isResultDefined(elifExpr); elifExpr = this.parseElifExpr())
		{
			if (isResultError(elifExpr))
				return elifExpr
			elifExprs.push(elifExpr.val)
		}
		const elseExpr = this.parseElseExpr()
		if (isResultError(elseExpr))
			return elseExpr
		return Ok(new ASTIfStmt(ifExpr.val, elifExprs, elseExpr.val))
	}

	parseParams(): Result<ASTParams | undefined, ParsingErrors>
	{
		const token = this.lexer.token
		const beginToken = token.clone()
		const leftParen = this.match(TokenType.leftParen)
		if (!leftParen)
			return Err('MissingParams')
		const node = new ASTParams(beginToken)
		node.add(leftParen)
		while (!token.typeIsOneOf(TokenType.rightParen))
		{
			const parameter = this.parseTypeDecl(false)
			if (!isResultValid(parameter))
				// Assertion required because tsc can't work out that undefined isn't in the valid set after this.
				return parameter as Result<undefined, ParsingErrors>
			node.addParameter(parameter.val)
			if (!token.typeIsOneOf(TokenType.rightParen))
			{
				const comma = this.match(TokenType.comma)
				if (!comma)
					return Err('MissingComma')
				else if (token.typeIsOneOf(TokenType.rightParen))
					return Err('MissingParams')
				node.add(comma)
			}
		}
		const rightParen = this.match(TokenType.rightParen)
		if (!rightParen)
			return Err('UnreachableState')
		node.add(rightParen)
		return Ok(node)
	}

	parseNoneType(): Result<ASTTypeDecl, ParsingErrors>
	{
		const noneToken = this.lexer.token.clone()
		const match = this.match(TokenType.noneType)
		if (!match)
			return Err('UnreachableState')
		const symbol = this.symbolTable.find(noneToken.value)
		if (!symbol)
			return Err('UnreachableState')
		const node = new ASTTypeDecl(new ASTIdent(noneToken, symbol))
		node.add(match)
		return Ok(node)
	}

	parseReturnTypeDecl(): Result<ASTTypeDecl | undefined, ParsingErrors>
	{
		const token = this.lexer.token
		if (token.typeIsOneOf(TokenType.noneType))
			return this.parseNoneType()
		// First try to get any storage specification modifiers
		const storageSpec = this.parseCVSpec()
		if (isResultError(storageSpec))
			return storageSpec
		// If we didn't error, now try and get a type
		const typeIdent = this.parseIdent()
		// If we have storage specifiers and do not have an identifier, that's a failure
		if (storageSpec.val && !isResultDefined(typeIdent))
			return Err('InvalidTokenSequence')
		if (!isResultValid(typeIdent))
			// Assertion required because tsc can't work out that undefined isn't in the valid set after this.
			return typeIdent as Result<undefined, ParsingErrors>
		const symbol = typeIdent.val.symbol?.clone()
		// So far we've parsed `<cvSpec> <type>`, now see if we have a ref or pointer.
		// TODO: dedupe this into 'parsePointerOrRef()`
		if (token.typeIsOneOf(TokenType.bitOp) && token.value == '&')
		{
			//const ref = new ASTReference(token)
			const match = this.match(TokenType.bitOp)
			if (!match)
				return Err('UnreachableState')
			typeIdent.val.add(match)
			symbol?.type.append(SymbolTypes.reference)
		}
		typeIdent.val.symbol = symbol
		// Check if the identifier is a type ident
		if (symbol?.isType)
			return Ok(new ASTTypeDecl(typeIdent.val, storageSpec.val))
		// If it is not or we can't tell, push it over to the look-aside storage and gracefully fail
		this._ident = typeIdent.val
		return Ok(undefined)
	}

	parseReturnType(): Result<ASTReturnType, ParsingErrors>
	{
		const functionTypeSpec = this.parseStorageSpec(false)
		if (isResultError(functionTypeSpec))
			return functionTypeSpec
		const token = this.lexer.token
		if (!token.typeIsOneOf(TokenType.arrow))
			return Err('IncorrectToken')
		const arrow = token.clone()
		const match = this.match(TokenType.arrow)
		if (!match)
			return Err('UnreachableState')
		const returnType = this.parseReturnTypeDecl()
		if (!isResultValid(returnType))
			return Err('MissingReturnType')
		if (isResultError(returnType))
			return returnType
		const node = new ASTReturnType(arrow, functionTypeSpec.val, returnType.val)
		node.add(match)
		return Ok(node)
	}

	parseTmplTypeParam(): Result<ASTNode, ParsingErrors>
	{
		const identDef = this.parseIdentDef()
		if (!isResultDefined(identDef))
			return Err('UnreachableState')
		if (isResultError(identDef))
			return identDef
		// XXX: Need to handle assignment still
		const {type, ident} = identDef.val
		if (!type)
			return Err('UnreachableState')
		return Ok(new ASTIdentDef(type, ident))
	}

	parseTmplValueParam(): Result<ASTNode, ParsingErrors>
	{
		const identDef = this.parseIdentDef()
		if (isResultError(identDef))
			return identDef
		if (!isResultValid(identDef))
			return Err('InvalidTokenSequence')
		// XXX: Need to handle assignment still
		const {type, ident} = identDef.val
		if (!type)
			return Err('UnreachableState')
		return Ok(new ASTIdentDef(type, ident))
	}

	parseTmplParam(): Result<ASTNode, ParsingErrors>
	{
		const token = this.lexer.token
		if (!token.typeIsOneOf(TokenType.ident))
			return Err('InvalidTokenSequence')
		if (token.value === 'type')
			return this.parseTmplTypeParam()
		return this.parseTmplValueParam()
	}

	parseTmplDef(): Result<ASTTemplate | undefined, ParsingErrors>
	{
		const token = this.lexer.token
		if (!token.typeIsOneOf(TokenType.relOp))
			return Ok(undefined)
		if (!isBeginTmpl(token.value))
			return Err('IncorrectToken')
		// Capture the opening '<' and fastforward to the next important token
		const beginToken = token.clone()
		const leftBracket = this.match(TokenType.relOp)
		if (!leftBracket)
			return Err('UnreachableState')
		// Begin a new template scope
		const node = new ASTTemplate(beginToken, this)
		node.add(leftBracket)
		const endTmplToken = (token: Token) => token.typeIsOneOf(TokenType.relOp) && isEndTmpl(token.value)
		while (!endTmplToken(token))
		{
			const parameter = this.parseTmplParam()
			if (!isResultValid(parameter))
				return parameter

			// If the next token after is not a '>'
			if (!endTmplToken(token))
			{
				// Try and match for a ','
				const comma = this.match(TokenType.comma)
				if (!comma)
					return Err('MissingComma')
				// Check if we matched a ',' and immediately have a '>'
				else if (endTmplToken(token))
					return Err('MissingParams')
				node.add(comma)
			}
		}
		// We're now sat on a '>' token. Adjust the end of the template params block accordingly and consume it
		node.adjustEnd(token, this.lexer.file)
		const rightBracket = this.match(TokenType.relOp)
		if (!rightBracket)
			return Err('UnreachableState')
		node.add(rightBracket)
		return Ok(node)
	}

	/*
	 * For templates, the following syntax is suggested to allow both declaration of new templates, and specialisations
	 * (both partial and complete):
	 *
	 * // Define A
	 * class A<type T> { [...] }
	 * // Fully specialise A in terms of type B
	 * class A<T = B> { [...] }
	 * // Partially specialise A in terms of type C and add extra template parameters
	 * class A<T = C, type D> { [...] }
	 * // Perform a shape match on the type T and decompose it to R and Args...
	 * class A<T = R(Args...), type R, type... Args> { [...] }
	 */

	parseClassDef(): Result<ASTNode, ParsingErrors>
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
		const className = ident.val
		if (className.symbol)
			return Err('SymbolAlreadyDefined')
		className.symbol = new MangroveSymbol(className.value, new SymbolType(SymbolTypes.struct | SymbolTypes.type))
		//ident.val.symbol.allocStruct(this)

		const templateParams = this.parseTmplDef()
		const result = ((): Result<ASTNode, ParsingErrors> =>
		{
			if (isResultError(templateParams))
				return templateParams

			const block = this.parseBlock()
			if (!isResultDefined(block))
				return Err('MissingBlock')
			if (isResultError(block))
				return block

			// If we are in a template context, pop the template symbol table too.
			if (templateParams.val)
				this.symbolTable.pop(this)

			const node = new ASTClass(token, className, block.val)
			node.add(match)
			return Ok(node)
		})()
		if (templateParams.val && !isResultValid(result))
			this.symbolTable.pop(this)
		return result
	}

	parseFunctionDef(): Result<ASTNode, ParsingErrors>
	{
		const functionToken = this.lexer.token.clone()
		const match = this.match(TokenType.functionDef)
		if (!match)
			return Err('UnreachableState')

		const ident = this.parseIdent()
		if (!isResultDefined(ident))
			return Err('InvalidTokenSequence')
		if (isResultError(ident))
			return ident

		const functionName = ident.val
		if (functionName.symbol)
			return Err('SymbolAlreadyDefined')
		functionName.symbol = new MangroveSymbol(functionName.value, new SymbolType(SymbolTypes.function))

		const templateParams = this.parseTmplDef()
		const result = ((): Result<ASTNode, ParsingErrors> =>
		{
			if (isResultError(templateParams))
				return templateParams

			const params = this.parseParams()
			if (!isResultDefined(params))
				return Err('InvalidTokenSequence')
			if (isResultError(params))
				return params

			const returnType = this.parseReturnType()
			if (!isResultDefined(returnType))
				return Err('MissingReturnType')
			if (isResultError(returnType))
				return returnType

			const block = this.parseBlock()
			if (!isResultDefined(block))
				return Err('MissingBlock')
			if (isResultError(block))
				return block

			// If we are in a template context, pop the template symbol table too.
			if (templateParams.val)
				this.symbolTable.pop(this)

			const node = new ASTFunction(functionToken, functionName, params.val, returnType.val, block.val)
			node.add(match)
			return Ok(node)
		})()
		if (templateParams.val && !isResultValid(result))
			this.symbolTable.pop(this)
		return result
	}

	parseOperator(): Result<Token | ASTIdent, ParsingErrors>
	{
		const token = this.lexer.token
		if (token.typeIsOneOf(TokenType.ident))
		{
			// Try and parse the identifier
			const typeIdent = this.parseIdent()
			// Make sure the result is defined and not an error
			if (!isResultDefined(typeIdent))
				return Err('InvalidTokenSequence')
			if (isResultError(typeIdent))
				return typeIdent
			// Extract the identifier's symbol
			const symbol = typeIdent.val.symbol
			// Check if the identifier is a type ident
			if (!symbol?.isType || symbol.type.isEqual(SymbolTypes.type))
				return Err('InvalidTokenSequence')
			return Ok(typeIdent.val)
		}
		const operatorToken = token.clone()
		const match = this.match(TokenType.invert, TokenType.incOp, TokenType.mulOp, TokenType.addOp,
			TokenType.shiftOp, TokenType.bitOp, TokenType.relOp, TokenType.equOp, TokenType.logicOp,
			TokenType.assignOp, TokenType.ident)
		if (!match)
			return Err('InvalidTokenSequence')
		return Ok(operatorToken)
	}

	parseOperatorDef(): Result<ASTNode, ParsingErrors>
	{
		const operatorToken = this.lexer.token.clone()
		const match = this.match(TokenType.operatorDef)
		if (!match)
			return Err('UnreachableState')

		const operator = this.parseOperator()
		if (isResultError(operator))
			return operator

		const params = this.parseParams()
		if (!isResultDefined(params))
			return Err('InvalidTokenSequence')
		if (isResultError(params))
			return params

		const returnType = this.parseReturnType()
		if (!isResultDefined(returnType))
			return Err('MissingReturnType')
		if (isResultError(returnType))
			return returnType

		const block = this.parseBlock()
		if (!isResultDefined(block))
			return Err('MissingBlock')
		if (isResultError(block))
			return block

		const node = new ASTOperator(operatorToken, operator.val, params.val, returnType.val, block.val)
		node.add(match)
		return Ok(node)
	}

	parseDefine(): Result<ASTNode | undefined, ParsingErrors>
	{
		const token = this.lexer.token
		if (token.typeIsOneOf(TokenType.classDef))
			return this.parseClassDef()
		if (token.typeIsOneOf(TokenType.functionDef))
			return this.parseFunctionDef()
		if (token.typeIsOneOf(TokenType.operatorDef))
			return this.parseOperatorDef()
		return Ok(undefined)
	}

	parseStatement(): Result<ASTNode | undefined, ParsingErrors>
	{
		const token = this.lexer.token
		if (token.typeIsOneOf(TokenType.ifStmt))
			return this.parseIfStmt()

		const stmt = this.parseDefine()
		if (isResultInvalid(stmt))
			return this.parseExpression()
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
		if (semicolonMatch)
			node.add(semicolonMatch)
		return Ok(node)
	}

	parseBraceBlock(): Result<ASTNode | undefined, ParsingErrors>
	{
		const token = this.lexer.token
		const beginToken = token.clone()
		const leftBrace = this.match(TokenType.leftBrace)
		if (!leftBrace)
			return Err('UnreachableState')
		const node = new ASTBlock(beginToken, this)
		node.add(leftBrace)
		while (!token.typeIsOneOf(TokenType.rightBrace))
		{
			const stmt = this.parseStatement()
			if (!isResultValid(stmt))
			{
				this.symbolTable.pop(this)
				return stmt
			}
			node.addStatement(stmt.val)
		}
		node.adjustEnd(token, this.lexer.file)
		this.symbolTable.pop(this)
		const rightBrace = this.match(TokenType.rightBrace)
		if (!rightBrace)
			return Err('UnreachableState')
		node.add(rightBrace)
		return Ok(node)
	}

	parseBlock(): Result<ASTNode | undefined, ParsingErrors>
	{
		const token = this.lexer.token
		if (token.typeIsOneOf(TokenType.leftBrace))
			return this.parseBraceBlock()
		return this.parseStatement()
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
			if (!isResultValid(stmt) && this.haveIdent)
			{
				const ident = this.ident as ASTIdent
				console.error(`Spurious left-over ident: ${ident}`)
				nodes.push(ident)
			}
			if (!isResultDefined(stmt))
			{
				this.lexer.next()
				continue
			}
			if (isResultValid(stmt))
				nodes.push(stmt.val)
			else
			{
				const start = token.location.start
				console.error(`Error during parsing: ${stmt.val} at ${start.line + 1}:${start.character + 1}`)
			}
		}
		return nodes
	}
}
