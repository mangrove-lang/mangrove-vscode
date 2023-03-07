import {Position, TextDocument} from 'vscode-languageserver-textdocument'
import {MangroveSymbol, SymbolTable, SymbolType, SymbolTypes} from '../ast/symbolTable'
import {TypeResolver} from '../ast/typeResolver'
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
	ASTCallArguments,
	ASTTemplateArguments,
} from '../ast/values'
import
{
	ASTBool,
	ASTCharLit,
	ASTFloat,
	ASTInt,
	ASTNull,
	ASTStringLit,
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
	ASTAssign,
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
	isEndTmpl,
} from './recogniser'
import
{
	ASTNew,
	ASTDelete,
	ASTReturn,
	ASTImportIdent,
	ASTImport,
	ASTIfExpr,
	ASTElifExpr,
	ASTElseExpr,
	ASTIfStmt,
	ASTForStmt,
	ASTWhileStmt,
	ASTVisibility,
	ASTParams,
	ASTReturnType,
	ASTTemplate,
	ASTFunction,
	ASTOperator,
	ASTClass,
	ASTBlock,
} from '../ast/statements'
import {ParsingErrors, ErrorKind, SyntaxError, toErrorKind} from './error'
import {Err, Ok, Result} from '../../utils/result'

function isInt(token: Token): boolean
{
	return token.typeIsOneOf(
		TokenType.binLit,
		TokenType.octLit,
		TokenType.hexLit,
		TokenType.intLit,
	)
}

function isNodeRelation(node: ASTNode | ASTRel): node is ASTRel
{
	return node.type === ASTType.rel
}

type IdentAndComments = {token: Token, comments: ASTNode[]}
type IdentDef = {type?: ASTIdent, ident: ASTIdent}
type BlockConfig = {allowExtStmt: boolean}

export class Parser
{
	private lexer: Tokeniser
	private _ident?: ASTIdent
	private _symbolTable: SymbolTable
	private _syntaxErrors: SyntaxError[] = []

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

	private set ident(ident: ASTIdent | undefined)
	{
		console.warn(`Updating ident look-aside from ${this._ident} to ${ident}`)
		this._ident = ident
	}

	private get haveIdent() { return !!this._ident }
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

	parseIdentStr(): Result<IdentAndComments | undefined, ParsingErrors>
	{
		const token = this.lexer.token.clone()
		if (!token.typeIsOneOf(TokenType.ident))
			return Ok(undefined)
		this.lexer.next()
		const comments = this.parseComments()
		if (token.typeIsOneOf(TokenType.dot))
			return Err('InvalidTokenSequence')
		comments.push(...this.skipWhite())
		return Ok({token, comments})
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
		if (!value)
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
		return this.symbolTable.find(ident)
	}

	parseDottedIdent(): Result<ASTIdent | undefined, ParsingErrors>
	{
		const token = this.lexer.token
		// If we have lookaside but the next token is not a dot, we can short-circuit return that
		if (this.haveIdent && (this._ident?.type === ASTType.dottedIdent || !token.typeIsOneOf(TokenType.dot)))
			return Ok(this.ident as ASTIdent)
		const comments: ASTNode[] = []
		const dottedIdent: Token[] = []
		const symbols: (MangroveSymbol | undefined)[] = []
		let haveDot = true
		while (haveDot)
		{
			// If we're in the first loop and we have lookaside, handle it, otherwise parse normally
			if (dottedIdent.length === 0 && this.haveIdent)
			{
				const ident = this.ident as ASTIdent
				symbols.push(ident.symbol)
				dottedIdent.push(ident.token)
				comments.push(...ident.comments)
			}
			else
			{
				// Grab the next identifier in the expression
				const ident = token.clone()
				// And ensure that it is an identifier token
				if (!token.typeIsOneOf(TokenType.ident))
					return Ok(undefined) // Err('IncorrectToken')

				this.lexer.next()
				const symbol = this.lookupIdentSymbolFromChain(ident.value, symbols)
				console.info(`Looked up ${ident}, found symbol ${symbol}`)
				symbols.push(symbol)
				// Add the newly parsed identifier to the ident list
				dottedIdent.push(ident)

				// Accumulate any comment nodes
				comments.push(...this.parseComments())
			}
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
			this._syntaxErrors.push(new SyntaxError(token, ErrorKind.constantExpected))
			this.lexer.next()
			return Err('IncorrectToken')
		}
		else if (isInt(token))
			return this.parseInt()
		else if (token.typeIsOneOf(TokenType.stringLit))
			return this.parseStringLiteral()
		else if (token.typeIsOneOf(TokenType.charLit))
			return this.parseCharLiteral()
		const bool = this.parseBool()
		if (bool.isDefined())
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
			if (!expr.isValid())
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
			if (!expr.isValid())
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

	parsePack(ident: ASTIdent): Result<ASTNode | undefined, ParsingErrors>
	{
		//const token = this.lexer.token.clone()
		const elipsis = this.match(TokenType.ellipsis)
		if (!elipsis)
			return Err('UnreachableState')
		// If the identifier is a dottedIdent rather than a plain ident, turn this into a parsing error.
		if (ident.type !== ASTType.ident)
			return Err('InvalidTokenSequence')
		// XXX: Need to validate that the identifier's type is that of a pack, and turn this into a SyntaxError if not.
		ident.add(elipsis)
		return Ok(ident)
	}

	parseValue(): Result<ASTNode | undefined, ParsingErrors>
	{
		const token = this.lexer.token
		if (!this.haveIdent)
		{
			const const_ = this.parseConst()
			if (const_.isDefined())
				return const_
		}
		const ident = this.parseDottedIdent()
		const startTmplToken = (token: Token) =>
			token.typeIsOneOf(TokenType.relOp) && isBeginTmpl(token.value)
		if (ident.isValid())
		{
			// Save the current lexer state so we can revert back to it
			// if there's a problem with template parsing since comparison using '<'
			// looks like a templated function
			const lexer = this.lexer.clone()
			// Handle function calls and things that look like templated function calls
			if (token.typeIsOneOf(TokenType.leftParen) || startTmplToken(token))
			{
				// Check both template args and funciton call.
				// Even if the template args are invalid, we might still be able to parse the function call.
				const templateArgs = this.parseTemplateArgs()
				if (templateArgs.isErr())
					this._syntaxErrors.push(new SyntaxError(token, ErrorKind.invalidTokenSequence))

				const func = this.parseFunctionCall(ident.val)
				if (func.isValid())
				{
					if (templateArgs.isValid())
						func.val.addTemplateArgs(templateArgs.val)
					return func
				}

				if (templateArgs.isValid())
					ident.val.addTemplateArgs(templateArgs.val)
				else
					// Not a valid template, reset the lexer
					this.lexer.update(lexer)
			}
			else if (token.typeIsOneOf(TokenType.leftSquare))
				return this.parseIndex(ident.val)
			else if (token.typeIsOneOf(TokenType.ellipsis))
				return this.parsePack(ident.val)
		}
		return ident
	}

	parseTemplateArgs(): Result<ASTTemplateArguments | undefined, ParsingErrors>
	{
		const token = this.lexer.token
		// If there's is not relOp, there's no template arguments
		if (!token.typeIsOneOf(TokenType.relOp))
			return Ok(undefined)
		if (!isBeginTmpl(token.value))
			return Err('UnreachableState')

		const node = new ASTTemplateArguments(token)
		const beginTmpl = this.match(TokenType.relOp)
		if (!beginTmpl)
			return Err('UnreachableState')

		node.add(beginTmpl)
		const endTmplToken = (token: Token) =>
			token.typeIsOneOf(TokenType.relOp) && isEndTmpl(token.value)
		while (!endTmplToken(token))
		{
			const value = this.parseValue()
			if (value.isErr())
				return value
			if (!value.isValid())
				return Err('InvalidTokenSequence')
			node.addArgument(value.val)
			if (!endTmplToken(token))
			{
				const comma = this.match(TokenType.comma)
				if (!comma)
					return Err('MissingComma')
				else if (endTmplToken(token))
				{
					// If we find a closing '>', consume it and return an error.
					// That way we can continue parsing without the whole expression failing
					this.lexer.next()
					this.skipWhite()
					return Err('MissingValue')
				}
				node.add(comma)
			}
		}

		node.adjustEnd(token, this.lexer.file)
		const endToken = token.clone()
		const endTmpl = this.match(TokenType.relOp)
		if (!endTmpl || !isEndTmpl(endToken.value))
			return Err('UnreachableState')

		node.add(endTmpl)
		return Ok(node)
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
			if (!value.isValid())
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
		if (!args.isValid())
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
			if (!value.isDefined())
				return Err('OperatorWithNoRHS')
			if (value.isErr())
				return value
			const node = new ASTPrefixOp(op, value.val)
			node.add(match)
			return Ok(node)
		}
		const value = this.parseValue()
		if (!value.isValid())
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
			if (!value.isDefined())
				return Err('OperatorWithNoRHS')
			if (value.isErr())
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
			if (!value.isDefined())
				return Err('OperatorWithNoRHS')
			if (value.isErr())
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
			if (!value.isDefined())
				return Err('OperatorWithNoRHS')
			if (value.isErr())
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
		if (!value.isValid())
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
			if (!rhs.isDefined())
				return Err('OperatorWithNoRHS')
			if (rhs.isErr())
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
		if (!lhs.isValid())
			return lhs
		const token = this.lexer.token
		if (!token.typeIsOneOf(TokenType.shiftOp))
			return lhs
		const op = token.clone()
		const match = this.match(TokenType.shiftOp)
		if (!match)
			return Err('UnreachableState')
		const rhs = this.parseAddExpr()
		if (!rhs.isDefined())
			return Err('OperatorWithNoRHS')
		if (rhs.isErr())
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
		if (!lhs.isValid() || !token.typeIsOneOf(TokenType.relOp, TokenType.equOp))
			return lhs
		const op = token.clone()
		const match = this.match(TokenType.relOp, TokenType.equOp)
		if (!match)
			return Err('UnreachableState')
		const rhs = this.parseBitExpr()
		if (!rhs.isDefined())
			return Err('OperatorWithNoRHS')
		if (rhs.isErr())
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
		if (rhsOp.value[0] !== lhsOp[0])
			return Err('IncorrectToken')
		const match = this.match(TokenType.relOp)
		if (!match)
			return Err('UnreachableState')
		const rhs = this.parseRelExpr()
		if (!rhs.isDefined())
			return Err('OperatorWithNoRHS')
		if (rhs.isErr())
			return rhs
		const node = new ASTBetween(relation, rhsOp, rhs.val)
		node.add(match)
		return Ok(node)
	}

	parseRelation(): Result<ASTNode | undefined, ParsingErrors>
	{
		const lhs = this.parseRelExpr()
		if (!lhs.isValid())
			return lhs
		if (!isNodeRelation(lhs.val))
			return lhs
		if (lhs.val.rhs.type === ASTType.ident)
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
		if (!relation.isValid())
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
			if (!rhs.isDefined())
				return Err('OperatorWithNoRHS')
			if (rhs.isErr())
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
		if (!ident.isDefined())
			return Err('OperatorWithNoRHS')
		if (ident.isErr())
			return ident
		const call = this.parseFunctionCall(ident.val)
		if (!call.isDefined())
			return Err('InvalidTokenSequence')
		if (call.isErr())
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
		if (!ident.isDefined())
			return Err('OperatorWithNoRHS')
		if (ident.isErr())
			return ident
		const node = new ASTDelete(token, ident.val)
		node.add(match)
		return Ok(node)
	}

	parseValueExpr(): Result<ASTNode | undefined, ParsingErrors>
	{
		const value = this.parseLogicExpr()
		if (!value.isDefined())
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
		if (!value.isDefined())
			return Err('OperatorWithNoRHS')
		if (value.isErr())
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
		if (!spec.isValid() || !volatileValid)
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
		if (storageSpec.isErr())
			return storageSpec
		const node = storageSpec.val ?? new ASTStorage()
		node.staticSpec = staticToken
		node.add(comments)
		return Ok(node)
	}

	parseRefOrPtr(typeIdent: ASTIdent): Result<MangroveSymbol | undefined, ParsingErrors>
	{
		const symbol = typeIdent.symbol?.clone()
		const token = this.lexer.token
		if (token.typeIsOneOf(TokenType.bitOp) && token.value === '&')
		{
			//const ref = new ASTReference(token)
			const match = this.match(TokenType.bitOp)
			if (!match)
				return Err('UnreachableState')
			typeIdent.add(match)
			symbol?.type.append(SymbolTypes.reference)
		}
		typeIdent.symbol = symbol
		return Ok(symbol)
	}

	parseTypeDecl(locationValid = true): Result<ASTTypeDecl | undefined, ParsingErrors>
	{
		// First try to get any storage specification modifiers
		const storageSpec = this.parseStorageSpec()
		if (storageSpec.isErr())
			return storageSpec
		if (locationValid)
		{
			// TODO: parse location specifications
		}
		// If we didn't error, now try and get a type
		const typeIdent = this.parseIdent()
		// If we have storage specifiers and do not have an identifier, that's a failure
		if (storageSpec.val && !typeIdent.isDefined())
			return Err('InvalidTokenSequence')
		if (typeIdent.isInvalid() || typeIdent.isErr())
			return typeIdent
		// This literally only exists to fix TS's type assertions as it can't figure out
		// that `Ok<ASTIdent>` is the only possible type for typeIdent after the previous if.
		if (!typeIdent.isDefined())
			return Err('UnreachableState')
		// So far we've parsed `<storageSpec> [<locationSpec>] <type>`, now see if we have a ref or pointer.
		const symbol = this.parseRefOrPtr(typeIdent.val)
		if (symbol.isErr())
			return symbol
		// Finally, if a location spec is not valid (we're parsing a parameter), try to parse
		// a `...` expression (pack expression) before concluding the type decl
		const token = this.lexer.token
		if (token.typeIsOneOf(TokenType.ellipsis))
		{
			// const pack = new ASTPack(token)
			const match = this.match(TokenType.ellipsis)
			if (!match)
				return Err('UnreachableState')
			typeIdent.val.add(match)
			const symbol = typeIdent.val.symbol
			symbol?.type.append(SymbolTypes.pack)
		}
		// Check if the identifier is a type ident (or, if parsing a parameter,
		// if it refers to a presently undefined symbol)
		if (symbol.val?.isType || (!locationValid && !symbol.val))
			return Ok(new ASTTypeDecl(typeIdent.val, storageSpec.val))
		// If it is not or we can't tell, push it over to the look-aside storage and gracefully fail
		this.ident = typeIdent.val
		return Ok(undefined)
	}

	parseIdentDef(locationValid = true): Result<IdentDef | undefined, ParsingErrors>
	{
		const type = this.parseTypeDecl(locationValid)
		if (!type.isDefined())
			return Ok(undefined)
		if (type.isErr())
			return type
		const typeSymbol = type.val.symbol
		if (!typeSymbol)
			return Err('UnreachableState')
		const ident = this.parseIdent()
		if (!ident.isDefined())
			return Err('InvalidTokenSequence')
		if (ident.isErr())
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
		if (identDef.isDefined())
			return identDef
		const dottedIdent = this.parseDottedIdent()
		if (!dottedIdent.isDefined())
			return Ok(undefined)
		if (dottedIdent.isErr())
			return dottedIdent
		return Ok({ident: dottedIdent.val})
	}

	parseAssignExpr(): Result<ASTNode | undefined, ParsingErrors>
	{
		const targetIdent = this.parseTargetIdent()
		if (!targetIdent.isDefined())
			return Ok(undefined)
		if (targetIdent.isErr())
			return targetIdent
		const {type, ident} = targetIdent.val
		const token = this.lexer.token
		if (!token.typeIsOneOf(TokenType.assignOp))
		{
			if (!type)
			{
				this.ident = ident
				return Ok(undefined)
			}
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
		const value = ((): Result<ASTNode | undefined, ParsingErrors> =>
		{
			// If the assignment expression is an assignment to a type ident
			// then try and parse a type (including ref/ptr information)
			if (target.symbol?.isAuto && target.symbol?.isType)
			{
				const typeIdent = this.parseIdent()
				if (!typeIdent.isDefined() || typeIdent.isErr())
					return typeIdent
				// If we got a valid identifier (we're assuming represents a type, for now), try parsing any extra info
				const symbol = this.parseRefOrPtr(typeIdent.val)
				if (symbol.isErr())
					return symbol
				// Check if the identifier is a type ident
				if (symbol.val?.isType)
					return Ok(new ASTTypeDecl(typeIdent.val, undefined))
				// Otherwise, if it's not or we can't tell, that's an error in this context.
				return Err('MissingType')
			}
			// Otherwise parse a value expression
			return this.parseValueExpr()
		})()
		if (!value.isDefined())
			return Err('OperatorWithNoRHS')
		if (value.isErr())
			return value
		// If we're assigning to something of the form `type T = ` (internally translated to type+auto),
		// ensure the value to assign is a type and copy its type over
		// Likewise, if assigning to `auto value = ` (internally just auto), decay the value type to
		// give the expression a type
		if (target.symbol?.isAuto)
		{
			const type = new TypeResolver().resolve(value.val)
			if (type)
			{
				if (target.symbol.isType)
					target.symbol.type = type
				else
					target.symbol.type = type.forValue()
			}
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
			if (expr.isDefined())
				return expr
			return this.parseLogicExpr()
		})()
		if (!expr.isValid())
			return expr
		const node = expr.val
		const match = this.match(TokenType.semi)
		if (match)
			node.add(match)
		return expr
	}

	parseImportTarget(): Result<ASTIdent, ParsingErrors>
	{
		const token = this.lexer.token
		// TODO: actually make use of this information and store it on the AST node
		while (token.typeIsOneOf(TokenType.dot, TokenType.ellipsis))
			this.match(TokenType.dot, TokenType.ellipsis)

		const libraryName = this.parseDottedIdent()
		if (!libraryName.isDefined())
			return Err('MissingIdent')
		return libraryName
	}

	parseImportIdent(): Result<ASTImportIdent, ParsingErrors>
	{
		const name = this.parseIdent()
		if (!name.isDefined())
			return Err('MissingIdent')
		if (name.isErr())
			return name

		const asToken = this.lexer.token.clone()
		if (!asToken.typeIsOneOf(TokenType.asStmt))
			return Ok(new ASTImportIdent(name.val))

		const match = this.match(TokenType.asStmt)
		if (!match)
			return Err('UnreachableState')

		const alias = this.parseIdent()
		if (!alias.isDefined())
			return Err('MissingIdent')
		if (alias.isErr())
			return alias

		const node = new ASTImportIdent(name.val, asToken, alias.val)
		node.add(match)
		return Ok(node)
	}

	parseImportStmt(): Result<ASTNode, ParsingErrors>
	{
		const token = this.lexer.token
		const fromToken = token.clone()
		const fromMatch = this.match(TokenType.fromStmt)
		if (!fromMatch)
			return Err('UnreachableState')

		const libraryName = this.parseImportTarget()
		if (libraryName.isErr())
			return libraryName

		const importToken = token.clone()
		const importMatch = this.match(TokenType.importStmt)
		if (!importMatch)
			return Err('InvalidTokenSequence')

		const node = new ASTImport(fromToken, importToken, libraryName.val)
		node.add(fromMatch)
		node.add(importMatch)

		let haveComma = true
		while (haveComma)
		{
			const ident = this.parseImportIdent()
			if (ident.isErr())
				return ident
			node.addIdent(ident.val)

			haveComma = token.typeIsOneOf(TokenType.comma)
			if (haveComma)
			{
				const comma = this.match(TokenType.comma)
				if (!comma)
					return Err('UnreachableState')
				node.add(comma)
			}
		}
		return Ok(node)
	}

	parseIfExpr(): Result<ASTIfExpr | undefined, ParsingErrors>
	{
		const token = this.lexer.token.clone()
		const match = this.match(TokenType.ifStmt)
		if (!match)
			return Err('UnreachableState')
		const cond = this.parseLogicExpr()
		if (!cond.isValid())
			return cond as Result<undefined, ParsingErrors>
		const block = this.parseBlock({allowExtStmt: false})
		if (!block.isDefined())
			return Err('MissingBlock')
		else if (block.isErr())
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
		if (!cond.isValid())
			return cond as Result<undefined, ParsingErrors>
		const block = this.parseBlock({allowExtStmt: false})
		if (!block.isDefined())
			return Err('MissingBlock')
		else if (block.isErr())
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
		const block = this.parseBlock({allowExtStmt: false})
		if (!block.isDefined())
			return Err('MissingBlock')
		else if (block.isErr())
			return block
		const node = new ASTElseExpr(token, block.val)
		node.add(match)
		return Ok(node)
	}

	parseIfStmt(): Result<ASTNode, ParsingErrors>
	{
		const ifExpr = this.parseIfExpr()
		if (!ifExpr.isDefined())
			return Err('InvalidTokenSequence')
		if (ifExpr.isErr())
			return ifExpr
		const elifExprs: ASTElifExpr[] = []
		for (let elifExpr = this.parseElifExpr(); elifExpr.isDefined(); elifExpr = this.parseElifExpr())
		{
			if (elifExpr.isErr())
				return elifExpr
			elifExprs.push(elifExpr.val)
		}
		const elseExpr = this.parseElseExpr()
		if (elseExpr.isErr())
			return elseExpr
		return Ok(new ASTIfStmt(ifExpr.val, elifExprs, elseExpr.val))
	}

	parseForStmt(): Result<ASTNode, ParsingErrors>
	{
		const forToken = this.lexer.token.clone()
		const match = this.match(TokenType.forStmt)
		if (!match)
			return Err('UnreachableState')
		// We have now matched a `for` token, match the opening `(` that's required.
		const leftParen = this.match(TokenType.leftParen)
		if (!leftParen)
			return Err('MissingParams')

		const typeIdent = this.parseCVType()
		if (!typeIdent.isDefined())
			return Err('MissingType')
		if (typeIdent.isErr())
			return typeIdent

		// We've now got a type, so parse an identifier for the type.
		const value = this.parseIdent()
		if (!value.isDefined())
			return Err('MissingIdent')
		if (value.isErr())
			return value

		const typeSymbol = typeIdent.val.symbol
		if (typeSymbol)
		{
			// TODO: Handle settings up the loop-local scope.
			// XXX: This is actually in the wrong scope right now, but is required for the loop body to work.
			const symbol = this.symbolTable.add(value.val.value)
			if (!symbol)
				return Err('SymbolAlreadyDefined')
			symbol.type = typeSymbol.type.forValue()
			value.val.symbol = symbol
		}

		// Now we've got the name of the variable that will contain the data for each iteration,
		// we need to parse the ':' delimeter and what to iterate over
		const colon = this.match(TokenType.colon)
		if (!colon)
			return Err('InvalidTokenSequence')

		const container = this.parseValue()
		if (!container.isDefined())
			return Err('MissingValue')
		if (container.isErr())
			return container

		// We've now matched the control block, so match the closing `)` that's required.
		const rightParen = this.match(TokenType.rightParen)
		if (!rightParen)
			return Err('MissingRightBracket')

		// Now match the loop body
		const block = this.parseBlock({allowExtStmt: false})
		if (!block.isDefined())
			return Err('MissingBlock')
		else if (block.isErr())
			return block

		const node = new ASTForStmt(forToken, container.val, block.val)
		node.add(match)
		node.add(leftParen)
		node.add(colon)
		node.add(rightParen)
		return Ok(node)
	}

	parseWhileStmt(): Result<ASTNode, ParsingErrors>
	{
		const whileToken = this.lexer.token.clone()
		const match = this.match(TokenType.whileStmt)
		if (!match)
			return Err('UnreachableState')
		// We have now matched a `while` token, look for the condition expression that must follow
		const cond = this.parseLogicExpr()
		if (!cond.isDefined())
			return Err('MissingCond')
		if (cond.isErr())
			return cond
		// Now parse the body of the loop
		const block = this.parseBlock({allowExtStmt: false})
		if (!block.isDefined())
			return Err('MissingBlock')
		else if (block.isErr())
			return block
		// And create a suitable AST node from the results
		const node = new ASTWhileStmt(whileToken, cond.val, block.val)
		node.add(match)
		return Ok(node)
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
			const type = this.parseTypeDecl(false)
			if (!type.isValid())
				// Assertion required because tsc can't work out that undefined isn't in the valid set after this.
				return type as Result<undefined, ParsingErrors>
			const typeSymbol = type.val.symbol

			// If the type declaration is followed by an identifier, this is a named parameter
			if (token.typeIsOneOf(TokenType.ident))
			{
				const ident = this.parseIdent()
				if (!ident.isDefined())
					return Err('UnreachableState')
				if (ident.isErr())
					return ident
				// Construct a suitable type for this parameter
				const symbol = this.symbolTable.add(ident.val.value)
				if (!symbol)
					return Err('SymbolAlreadyDefined')
				if (typeSymbol)
					symbol.type = typeSymbol.type.forValue()
				ident.val.symbol = symbol
				// And store the parameter. It is already in the symbol table at this stage
				node.addParameter(new ASTIdentDef(type.val, ident.val))
			}
			else
				// For parameters that are not named, store the type for later checking
				node.addParameter(type.val)

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

	parseCVType(): Result<ASTTypeDecl | undefined, ParsingErrors>
	{
		// First try to get any storage specification modifiers
		const storageSpec = this.parseCVSpec()
		if (storageSpec.isErr())
			return storageSpec
		// If we didn't error, now try and get a type
		const typeIdent = this.parseIdent()
		// If we do not have an identifier, that's a failure
		if (!typeIdent.isDefined())
			return Err('MissingType')
		if (typeIdent.isErr())
			return typeIdent
		// So far we've parsed `<cvSpec> <type>`, now see if we have a ref or pointer.
		const symbol = this.parseRefOrPtr(typeIdent.val)
		if (symbol.isErr())
			return symbol
		// Check if the identifier is a type ident
		if (symbol.val?.isType)
			return Ok(new ASTTypeDecl(typeIdent.val, storageSpec.val))
		return Ok(undefined)
	}

	parseReturnTypeDecl(): Result<ASTTypeDecl | undefined, ParsingErrors>
	{
		const token = this.lexer.token
		if (token.typeIsOneOf(TokenType.noneType))
			return this.parseNoneType()
		return this.parseCVType()
	}

	parseReturnType(): Result<ASTReturnType, ParsingErrors>
	{
		const functionTypeSpec = this.parseStorageSpec(false)
		if (functionTypeSpec.isErr())
			return functionTypeSpec
		const token = this.lexer.token
		if (!token.typeIsOneOf(TokenType.arrow))
			return Err('IncorrectToken')
		const arrow = token.clone()
		const match = this.match(TokenType.arrow)
		if (!match)
			return Err('UnreachableState')
		const returnType = this.parseReturnTypeDecl()
		if (!returnType.isDefined())
			return Err('MissingReturnType')
		if (returnType.isErr())
			return returnType
		const node = new ASTReturnType(arrow, functionTypeSpec.val, returnType.val)
		node.add(match)
		return Ok(node)
	}

	parseTmplTypeParam(): Result<ASTIdentDef, ParsingErrors>
	{
		const identDef = this.parseIdentDef(false)
		if (!identDef.isDefined())
			return Err('UnreachableState')
		if (identDef.isErr())
			return identDef
		// XXX: Need to handle assignment still
		const {type, ident} = identDef.val
		if (!type)
			return Err('UnreachableState')
		return Ok(new ASTIdentDef(type, ident))
	}

	parseTmplValueParam(): Result<ASTIdentDef, ParsingErrors>
	{
		const identDef = this.parseIdentDef(false)
		if (identDef.isErr())
			return identDef
		if (!identDef.isValid())
			return Err('InvalidTokenSequence')
		// XXX: Need to handle assignment still
		const {type, ident} = identDef.val
		if (!type)
			return Err('UnreachableState')
		return Ok(new ASTIdentDef(type, ident))
	}

	parseTmplParam(): Result<ASTIdentDef, ParsingErrors>
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

		const endTmplToken = (token: Token) =>
			token.typeIsOneOf(TokenType.relOp) && isEndTmpl(token.value)
		while (!endTmplToken(token))
		{
			const parameter = this.parseTmplParam()
			if (!parameter.isValid())
				return parameter
			node.addParameter(parameter.val)

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
		if (!ident.isDefined())
			return Err('InvalidTokenSequence')
		if (ident.isErr())
			return ident
		const className = ident.val
		if (className.symbol)
			return Err('SymbolAlreadyDefined')
		className.symbol = new MangroveSymbol(className.value, new SymbolType(SymbolTypes.struct | SymbolTypes.type))
		//ident.val.symbol.allocStruct(this)
		this.symbolTable.insert(className.symbol)

		const templateParams = this.parseTmplDef()
		const result = ((): Result<ASTNode, ParsingErrors> =>
		{
			if (templateParams.isErr())
				return templateParams

			const block = this.parseBlock({allowExtStmt: true})
			if (!block.isDefined())
				return Err('MissingBlock')
			if (block.isErr())
				return block

			// If we are in a template context, pop the template symbol table too.
			if (templateParams.val)
				this.symbolTable.pop(this)

			const node = new ASTClass(token, className, templateParams.val, block.val)
			node.add(match)
			return Ok(node)
		})()
		if (templateParams.val && !result.isValid())
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
		if (!ident.isDefined())
			return Err('InvalidTokenSequence')
		if (ident.isErr())
			return ident

		const functionName = ident.val
		// If the symbol's already in the table but is not a function symbol, that's an error
		if (functionName.symbol && !functionName.symbol.type.mask(SymbolTypes.function))
			return Err('SymbolAlreadyDefined')
		functionName.symbol = new MangroveSymbol(functionName.value, new SymbolType(SymbolTypes.function))
		this.symbolTable.insert(functionName.symbol)

		const templateParams = this.parseTmplDef()
		const result = ((): Result<ASTNode, ParsingErrors> =>
		{
			if (templateParams.isErr())
				return templateParams

			const params = this.parseParams()
			if (!params.isDefined())
				return Err('InvalidTokenSequence')
			if (params.isErr())
				return params

			const returnType = this.parseReturnType()
			if (!returnType.isDefined())
				return Err('MissingReturnType')
			if (returnType.isErr())
				return returnType

			const block = this.parseBlock({allowExtStmt: false})
			if (!block.isDefined())
				return Err('MissingBlock')
			if (block.isErr())
				return block

			// If we are in a template context, pop the template symbol table too.
			if (templateParams.val)
				this.symbolTable.pop(this)

			const node = new ASTFunction(
				functionToken, functionName, templateParams.val, params.val, returnType.val, block.val,
			)
			node.add(match)
			return Ok(node)
		})()
		if (templateParams.val && !result.isValid())
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
			if (!typeIdent.isDefined())
				return Err('InvalidTokenSequence')
			if (typeIdent.isErr())
				return typeIdent
			// Extract the identifier's symbol
			const symbol = typeIdent.val.symbol
			// Check if the identifier is a type ident
			if (!symbol?.isType || symbol.type.isEqual(SymbolTypes.type))
				return Err('InvalidTokenSequence')
			return Ok(typeIdent.val)
		}
		const operatorToken = token.clone()
		const match = this.match(
			TokenType.invert, TokenType.incOp, TokenType.mulOp, TokenType.addOp,
			TokenType.shiftOp, TokenType.bitOp, TokenType.relOp, TokenType.equOp,
			TokenType.logicOp, TokenType.assignOp, TokenType.ident,
		)
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
		if (operator.isErr())
			return operator

		const params = this.parseParams()
		if (!params.isDefined())
			return Err('InvalidTokenSequence')
		if (params.isErr())
			return params

		const returnType = this.parseReturnType()
		if (!returnType.isDefined())
			return Err('MissingReturnType')
		if (returnType.isErr())
			return returnType

		const block = this.parseBlock({allowExtStmt: false})
		if (!block.isDefined())
			return Err('MissingBlock')
		if (block.isErr())
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

	parseStatement(config: BlockConfig): Result<ASTNode | undefined, ParsingErrors>
	{
		const token = this.lexer.token
		if (config.allowExtStmt && token.typeIsOneOf(TokenType.visibility))
			return this.parseVisibility()
		if (token.typeIsOneOf(TokenType.fromStmt))
			return this.parseImportStmt()
		if (token.typeIsOneOf(TokenType.ifStmt))
			return this.parseIfStmt()
		if (token.typeIsOneOf(TokenType.forStmt))
			return this.parseForStmt()
		if (token.typeIsOneOf(TokenType.whileStmt))
			return this.parseWhileStmt()

		const stmt = this.parseDefine()
		if (stmt.isInvalid())
			return this.parseExpression()
		return stmt
	}

	parseVisibility(): Result<ASTNode, ParsingErrors>
	{
		const node = new ASTVisibility(this.lexer.token)
		const match = this.match(TokenType.visibility)
		if (!match)
			return Err('UnreachableState')
		node.add(match)
		const semicolonMatch = this.match(TokenType.semi)
		if (semicolonMatch)
			node.add(semicolonMatch)
		return Ok(node)
	}

	parseBraceBlock(config: BlockConfig): Result<ASTNode | undefined, ParsingErrors>
	{
		const token = this.lexer.token
		const beginToken = token.clone()
		const leftBrace = this.match(TokenType.leftBrace)
		if (!leftBrace)
			return Err('UnreachableState')
		const node = new ASTBlock(beginToken, this)
		node.add(leftBrace)
		while (!token.typeIsOneOf(TokenType.rightBrace, TokenType.eof))
		{
			this.parseStatement(config)
				.map(stmt =>
				{
					if (stmt)
						node.addStatement(stmt)
					else
					{
						this._syntaxErrors.push(new SyntaxError(token, ErrorKind.parsingFailed))
						if (this.haveIdent)
						{
							const ident = this.ident as ASTIdent
							console.error(`Spurious left-over ident: ${ident}`)
							node.addStatement(ident)
						}
						else
							this.lexer.next()
					}
				})
				.mapErr(err =>
				{
					this._syntaxErrors.push(new SyntaxError(token, toErrorKind(err)))
					this.lexer.next()
				})
		}
		node.adjustEnd(token, this.lexer.file)
		this.symbolTable.pop(this)
		const rightBrace = this.match(TokenType.rightBrace)
		if (!rightBrace)
			return Err('UnreachableState')
		node.add(rightBrace)
		return Ok(node)
	}

	parseBlock(config: BlockConfig): Result<ASTNode | undefined, ParsingErrors>
	{
		const token = this.lexer.token
		if (token.typeIsOneOf(TokenType.leftBrace))
			return this.parseBraceBlock(config)
		return this.parseStatement(config)
	}

	public parse(): ASTNode[]
	{
		const token = this.lexer.next()
		const nodes = this.skipWhite()
		while (!token.typeIsOneOf(TokenType.eof))
		{
			const stmt = this.parseStatement({allowExtStmt: true})
			if (!stmt.isValid() && this.haveIdent)
			{
				const ident = this.ident as ASTIdent
				console.error(`Spurious left-over ident: ${ident}`)
				nodes.push(ident)
			}
			if (!stmt.isDefined())
			{
				this.lexer.next()
				continue
			}
			if (stmt.isValid())
				nodes.push(stmt.val)
			else
			{
				const start = token.location.start
				console.error(`Error during parsing: ${stmt.val} at ${start.line + 1}:${start.character + 1}`)
				this.lexer.next()
			}
		}

		if (this._syntaxErrors.length !== 0)
		{
			console.warn(`Encountered ${this._syntaxErrors.length} errors while parsing:`)
			for (const error of this._syntaxErrors)
				console.error(error.toString())
		}
		return nodes
	}
}
