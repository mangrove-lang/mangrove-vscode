import {Ok, Err, Result} from 'ts-results'
import {Position, TextDocument} from 'vscode-languageserver-textdocument'
import {ASTIdent, ASTInvalid} from '../ast/values'
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
import {ASTRel, ASTBetween, ASTLogic} from '../ast/operations'
import {Tokeniser} from './tokeniser'
import {Token, TokenType} from './types'
import {isEquality} from './recogniser'
import
{
	ASTIfExpr,
	ASTElifExpr,
	ASTElseExpr,
	ASTIfStmt,
	ASTVisibility
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
	'MissingBlock'

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

function *yieldTokens(node: Result<ASTNode | undefined, ParsingErrors>)
{
	if (isResultValid(node))
		yield *node.val.yieldTokens()
	return isResultValid(node)
}

type IdentAndComments = {token: Token, comments: ASTNode[]}

export class Parser
{
	private lexer: Tokeniser
	private _ident: Token

	constructor(file: TextDocument)
	{
		this.lexer = new Tokeniser(file)
		this._ident = new Token()
	}

	get haveIdent()
	{
		return this._ident.valid
	}

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

	parseIdent(): Result<ASTNode | undefined, ParsingErrors>
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

	parseValue(): Result<ASTNode | undefined, ParsingErrors>
	{
		//const token = this.lexer.token
		if (this.haveIdent)
		{
			const node = new ASTIdent(this._ident)
			this._ident.reset()
			return Ok(node)
		}
		const const_ = this.parseConst()
		if (isResultDefined(const_))
			return const_
		const ident = this.parseIdent()
		//if (ident)
		//{
		//}
		return ident
	}

	parseRelExpr(): Result<ASTNode | ASTRel | undefined, ParsingErrors>
	{
		const lhs = this.parseValue()
		const token = this.lexer.token
		if (!(isResultValid(lhs) && token.typeIsOneOf(TokenType.relOp, TokenType.equOp)))
			return lhs
		const op = token.clone()
		const match = this.match(TokenType.relOp, TokenType.equOp)
		if (!match)
			return Err('UnreachableState')
		const rhs = this.parseValue()
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
			lhs = new ASTLogic(op, lhs, rhs.val)
		}
		return Ok(lhs)
	}

	parseExpression(): Result<ASTNode | undefined, ParsingErrors>
	{
		// XXX: This needs to be restructured as a process that deals with ASTNodes instead of nested generators.
		const expr = ((): Result<ASTNode | undefined, ParsingErrors> =>
		{
			//const token = this.lexer.token
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

	*parseIfExpr(): Generator<Token, Result<ASTIfExpr | undefined, ParsingErrors>, undefined>
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
		const blockExpr = yield *this.parseBlock()
		if (!blockExpr)
		// if (!isResultDefined(blockExpr))
			return Err('MissingBlock')
		// const block = blockExpr.unwrap()
		const block: ASTNode = new ASTInvalid(new Token())
		const node = new ASTIfExpr(token, cond.val, block)
		node.add(match)
		return Ok(node)
	}

	*parseElifExpr(): Generator<Token, Result<ASTElifExpr | undefined, ParsingErrors>, undefined>
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
		const blockExpr = yield *this.parseBlock()
		if (!blockExpr)
		// if (!isResultDefined(blockExpr))
			return Err('MissingBlock')
		// const block = blockExpr.unwrap()
		const block: ASTNode = new ASTInvalid(new Token())
		const node = new ASTElifExpr(token, cond.val, block)
		node.add(match)
		return Ok(node)
	}

	*parseElseExpr(): Generator<Token, Result<ASTElseExpr | undefined, ParsingErrors>, undefined>
	{
		const token = this.lexer.token.clone()
		if (!token.typeIsOneOf(TokenType.elseStmt))
			return Ok(undefined)
		const match = this.match(TokenType.elseStmt)
		if (!match)
			return Err('UnreachableState')
		const blockExpr = yield *this.parseBlock()
		if (!blockExpr)
		// if (!isResultDefined(blockExpr))
			return Err('MissingBlock')
		// const block = blockExpr.unwrap()
		const block: ASTNode = new ASTInvalid(new Token())
		const node = new ASTElseExpr(token, block)
		node.add(match)
		return Ok(node)
	}

	*parseIfStmt(): Generator<Token, Result<ASTNode | undefined, ParsingErrors>, undefined>
	{
		const ifExpr = yield *this.parseIfExpr()
		if (!isResultValid(ifExpr))
			return ifExpr
		let elifExprs: ASTElifExpr[] = []
		while (true)
		{
			const elifExpr = yield *this.parseElifExpr()
			if (!isResultDefined(elifExpr))
				break
			if (isResultError(elifExpr))
				return elifExpr
			elifExprs.push(elifExpr.val)
		}
		const elseExpr = yield *this.parseElseExpr()
		if (isResultError(elseExpr))
			return elseExpr
		return Ok(new ASTIfStmt(ifExpr.val, elifExprs, elseExpr.val))
	}

	*parseStatement(): Generator<Token, Result<ASTNode | undefined, ParsingErrors>, undefined>
	{
		let stmt: Result<ASTNode | undefined, ParsingErrors> = Ok(undefined)
		if (!isResultValid(stmt))
			stmt = yield *this.parseIfStmt()
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

	*parseBraceBlock(): Generator<Token, boolean, undefined>
	{
		const token = this.lexer.token
		if (!token.typeIsOneOf(TokenType.leftBrace))
			return yield *yieldTokens(yield *this.parseStatement())
		let comments = this.match(TokenType.leftBrace)
		if (comments)
		{
			for (const comment of comments)
				yield *comment.yieldTokens()
		}
		while (!token.typeIsOneOf(TokenType.rightBrace))
		{
			const stmt = yield *yieldTokens(yield *this.parseStatement())
			if (!stmt)
				return false
		}
		comments = this.match(TokenType.rightBrace)
		if (comments)
		{
			for (const comment of comments)
				yield *comment.yieldTokens()
		}
		return !!comments
	}

	*parseBlock(): Generator<Token, boolean, undefined>
	{
		return yield *this.parseBraceBlock()
	}

	*parseExtStatement(): Generator<Token, boolean, undefined>
	{
		const stmt = yield *yieldTokens(this.parseVisibility())
		if (!stmt)
			return yield *yieldTokens(yield *this.parseStatement())
		return stmt
	}

	public *tokenise(): Generator<Token, void, undefined>
	{
		const token = this.lexer.next()
		const comments = this.skipWhite()
		for (const comment of comments)
			yield *comment.yieldTokens()
		while (!token.typeIsOneOf(TokenType.eof))
		{
			const stmt = yield *this.parseExtStatement()
			if (!stmt)
				this.lexer.next()
				//break
		}
	}
}
