// SPDX-License-Identifier: BSD-3-Clause

/* eslint-disable @typescript-eslint/no-empty-interface */

import {ASTBool, ASTCharLit, ASTFloat, ASTInt, ASTNull, ASTStringLit} from '../src/server/ast/literals'
import {ASTAssign, ASTBetween, ASTBinaryOp, ASTFunctionCall, ASTUnaryOp} from '../src/server/ast/operations'
import
{
	ASTBlock,
	ASTClass,
	ASTDelete,
	ASTElifExpr,
	ASTElseExpr,
	ASTForStmt,
	ASTFunction,
	ASTIfExpr,
	ASTIfStmt,
	ASTImport,
	ASTImportIdent,
	ASTNew,
	ASTOperator,
	ASTParams,
	ASTReturn,
	ASTReturnType,
	ASTTemplate,
	ASTVisibility,
	ASTWhileStmt,
} from '../src/server/ast/statements'
import {MangroveSymbol, SymbolTable} from '../src/server/ast/symbolTable'
import {ASTComment, ASTNode, ASTType, ASTVisibilityType} from '../src/server/ast/types'
import
{
	ASTCallArguments,
	ASTDottedIdent,
	ASTIdent,
	ASTIdentDef,
	ASTIndex,
	ASTInvalid,
	ASTSlice,
	ASTStorage,
	ASTTemplateArguments,
	ASTTypeDecl,
} from '../src/server/ast/values'
import {Token, TokenType} from '../src/server/parser/types'
import {Result, Err, Ok} from 'ts-results'

// Based on the jest except return type
interface TestMsg
{
	pass: boolean;
	message: string;
}

type EqualPass = Result<TestMsg, TestMsg>

type TestPath =
{
	path: string
	latestToken?: Token
}

declare module '../src/server/ast/types'
{
	interface ASTNode
	{
		isEqualNode(expected: ASTNode, path: TestPath): EqualPass
	}
	interface ASTComment extends ASTNode {}
}

declare module '../src/server/parser/types'
{
	interface Token
	{
		isEqualNode(expected: Token, path: TestPath): EqualPass
	}
}

declare module '../src/server/ast/symbolTable'
{
	interface MangroveSymbol
	{
		isEqualNode(expected: MangroveSymbol, path: TestPath): EqualPass
	}
	interface SymbolTable
	{
		isEqualNode(expected: SymbolTable, path: TestPath): EqualPass
	}
}

declare module '../src/server/ast/values'
{
	interface ASTInvalid extends ASTNode {}
	interface ASTIdent extends ASTNode {}
	interface ASTDottedIdent extends ASTIdent {}
	interface ASTStorage extends ASTNode {}
	interface ASTTypeDecl extends ASTIdent {}
	interface ASTIdentDef extends ASTIdent {}
	interface ASTIndex extends ASTNode {}
	interface ASTSlice extends ASTNode {}
	interface ASTCallArguments extends ASTNode {}
	interface ASTTemplateArguments extends ASTNode {}
}

declare module '../src/server/ast/statements'
{
	interface ASTNew extends ASTNode {}
	interface ASTDelete extends ASTNode {}
	interface ASTReturn extends ASTNode {}
	interface ASTImportIdent extends ASTNode {}
	interface ASTImport extends ASTNode {}
	interface ASTIfExpr extends ASTNode {}
	interface ASTElifExpr extends ASTNode {}
	interface ASTElseExpr extends ASTNode {}
	interface ASTIfStmt extends ASTNode {}
	interface ASTForStmt extends ASTNode {}
	interface ASTWhileStmt extends ASTNode {}
	interface ASTVisibility extends ASTNode {}
	interface ASTParams extends ASTNode {}
	interface ASTReturnType extends ASTNode {}
	interface ASTTemplate extends ASTNode {}
	interface ASTFunction extends ASTNode {}
	interface ASTOperator extends ASTNode {}
	interface ASTClass extends ASTNode {}
	interface ASTBlock extends ASTNode {}
}

declare module '../src/server/ast/literals'
{
	interface ASTInt extends ASTNode {}
	interface ASTFloat extends ASTNode {}
	interface ASTStringLit extends ASTNode {}
	interface ASTCharLit extends ASTNode {}
	interface ASTBool extends ASTNode {}
	interface ASTNull extends ASTNode {}
}

declare module '../src/server/ast/operations'
{
	interface ASTFunctionCall extends ASTNode {}
	interface ASTUnaryOp extends ASTNode {}
	interface ASTBinaryOp extends ASTNode {}
	interface ASTPrefixOp extends ASTUnaryOp {}
	interface ASTPostfixOp extends ASTUnaryOp {}
	interface ASTDeref extends ASTUnaryOp {}
	interface ASTInvert extends ASTUnaryOp {}
	interface ASTMul extends ASTUnaryOp {}
	interface ASTAdd extends ASTUnaryOp {}
	interface ASTShift extends ASTUnaryOp {}
	interface ASTBit extends ASTUnaryOp {}
	interface ASTRel extends ASTUnaryOp {}
	interface ASTBetween extends ASTNode {}
	interface ASTLogic extends ASTUnaryOp {}
	interface ASTAssign extends ASTNode {}
}

function eqOk()
{
	return Ok(
		{
			message: '',
			pass: true,
		}
	)
}

function eqFail(message: string, path: TestPath)
{
	let errorLocation = ''
	if (path.latestToken)
	{
		const line = path.latestToken.location.start.line
		const column = path.latestToken.location.start.character
		errorLocation = `At line: ${line + 1}, column: ${column}\n`
	}

	return Err(
		{
			message: `${errorLocation}${message} in ${path.path}`,
			pass: false,
		}
	)
}

type NextT = {toString: () => string}
function nextPath<T extends NextT>(path: TestPath, expected: T): TestPath
{
	const newPath = {...path}
	newPath.path = `${path.path} -> ${expected.toString()}`
	return newPath
}

function matchTypeAndToken(received: ASTNode, expected: ASTNode, path: TestPath): EqualPass
{
	path.latestToken = received.token

	if (received.type !== expected.type)
	{
		const msg = `Expected ASTType: '${ASTType[expected.type]}', received '${ASTType[received.type]}'`
		return eqFail(msg, path)
	}

	received.token.isEqualNode(expected.token, path).unwrap()
	return eqOk()
}

type EqualType<T> = {isEqualNode: (expected: T, path: TestPath) => EqualPass} & NextT
function undefinedEqual<T extends EqualType<T>>(
	received: T | undefined,
	expected: T | undefined,
	valName: string,
	path: TestPath,
): EqualPass
{
	if (!received && expected)
		return eqFail(`Value '${valName}' expected to be defined. Was undefined`, path)
	if (received && !expected)
		return eqFail(`Value '${valName}' expected to be undefined. Was defined`, path)

	if (expected && received)
	{
		const next = nextPath(path, expected)
		received.isEqualNode(expected, next).unwrap()
	}

	// Both are undefined so they are equal
	return eqOk()
}

function undefinedListEqual<T extends EqualType<T>>(
	received: (T | undefined)[],
	expected: (T | undefined)[],
	valName: string,
	path: TestPath,
): EqualPass
{
	if (!received && expected)
		return eqFail(`Value '${valName}' expected to be defined. Was undefined`, path)
	if (received && !expected)
		return eqFail(`Value '${valName}' expected to be undefined. Was defined`, path)

	if (expected && received)
	{
		const next = nextPath(path, expected)
		for (const idx in received)
		{
			const rec = received[idx]
			const exp = expected[idx]
			undefinedEqual(rec, exp, `${valName} index ${idx}`, next).unwrap()
		}
	}

	// Both are undefined so they are equal
	return eqOk()
}

function listEqual<T extends EqualType<T>>(received: T[], expected: T[], valName: string, path: TestPath): EqualPass
{
	if (received.length !== expected.length)
		return eqFail(`List '${valName}' had length of ${received.length}. Expected ${expected.length}`, path)

	const next = nextPath(path, expected)
	for (const idx in received)
	{
		const rec = received[idx]
		const exp = expected[idx]
		rec.isEqualNode(exp, next).unwrap()
	}

	// All items were equal
	return eqOk()
}

/* src/server/ast/types.ts start */
ASTComment.prototype.isEqualNode = function isEqualNode(expected: ASTComment, path: TestPath)
{
	return matchTypeAndToken(this, expected, nextPath(path, expected))
}
/* src/server/ast/types.ts end */

/* src/server/ast/values.ts start */
Token.prototype.isEqualNode = function isEqualNode(expected: Token, path: TestPath)
{
	if (this.type !== expected.type)
		return eqFail(`Expected Token type '${TokenType[expected.type]}' received '${TokenType[this.type]}'`, path)
	if (this.value !== expected.value)
		return eqFail(`Expected Token value '${expected.value}' received '${this.value}'`, path)

	return eqOk()
}
/* src/server/ast/values.ts end */

/* src/server/ast/symbolTable.ts start */
MangroveSymbol.prototype.isEqualNode = function isEqualNode(expected: MangroveSymbol, path: TestPath)
{
	if (!this.isEqual(expected))
		return eqFail(`Expected Symbol ${expected}, received ${this}`, path)

	return eqOk()
}

SymbolTable.prototype.isEqualNode = function isEqualNode(expected: SymbolTable, path: TestPath)
{
	// TODO:
	// undefinedEqual(this.parentTable, expected.parentTable, "parentTable", path).unwrap()

	if (this.table.size !== expected.table.size)
		return eqFail(`Expected Symboltable have ${expected.table.size} items, received ${this.table.size}`, path)

	for (const [key, value] of expected.table)
	{
		const rValue = this.table.get(key)
		if (rValue === undefined)
			return eqFail(`Expected Symboltable to symbol ${key}`, path)
		if (!value.isEqual(rValue))
			return eqFail(`Expected Symboltable symbol to be ${value}, received ${rValue}`, path)
	}

	return eqOk()
}
/* src/server/ast/symbolTable.ts end */

/* src/server/ast/statemets.ts start */
ASTNew.prototype.isEqualNode = function isEqualNode(expected: ASTNode, path: TestPath)
{
	const next = nextPath(path, expected)
	matchTypeAndToken(this, expected, next).unwrap()

	const item = expected as ASTNew
	this.ctorCall.isEqualNode(item.ctorCall, next).unwrap()
	return eqOk()
}

ASTDelete.prototype.isEqualNode = function isEqualNode(expected: ASTNode, path: TestPath)
{
	const next = nextPath(path, expected)
	matchTypeAndToken(this, expected, next).unwrap()

	const item = expected as ASTDelete
	this.ident.isEqualNode(item.ident, next).unwrap()
	return eqOk()
}

ASTReturn.prototype.isEqualNode = function isEqualNode(expected: ASTNode, path: TestPath)
{
	const next = nextPath(path, expected)
	matchTypeAndToken(this, expected, next).unwrap()

	const item = expected as ASTReturn
	this.expr.isEqualNode(item.expr, next).unwrap()
	return eqOk()
}

ASTImportIdent.prototype.isEqualNode = function isEqualNode(expected: ASTNode, path: TestPath)
{
	const next = nextPath(path, expected)
	matchTypeAndToken(this, expected, next).unwrap()

	const item = expected as ASTImportIdent
	undefinedEqual(this.alias, item.alias, 'alias', next).unwrap()
	this.nameIdent.isEqualNode(item.nameIdent, next).unwrap()
	return eqOk()
}

ASTImport.prototype.isEqualNode = function isEqualNode(expected: ASTNode, path: TestPath)
{
	const next = nextPath(path, expected)
	matchTypeAndToken(this, expected, next).unwrap()

	const item = expected as ASTImport
	this.libraryNameIdent.isEqualNode(item.libraryNameIdent, next).unwrap()
	this.importToken.isEqualNode(item.importToken, next).unwrap()
	listEqual(this.importedIdents, item.importedIdents, 'importedIdents', next).unwrap()
	return eqOk()
}

ASTIfExpr.prototype.isEqualNode = function isEqualNode(expected: ASTNode, path: TestPath)
{
	const next = nextPath(path, expected)
	matchTypeAndToken(this, expected, next).unwrap()

	const item = expected as ASTIfExpr
	this.trueBlock.isEqualNode(item.trueBlock, next).unwrap()
	this.cond.isEqualNode(item.cond, next).unwrap()
	return eqOk()
}

ASTElifExpr.prototype.isEqualNode = function isEqualNode(expected: ASTNode, path: TestPath)
{
	const next = nextPath(path, expected)
	matchTypeAndToken(this, expected, next).unwrap()

	const item = expected as ASTElifExpr
	this.trueBlock.isEqualNode(item.trueBlock, next).unwrap()
	this.cond.isEqualNode(item.cond, next).unwrap()
	return eqOk()
}

ASTElseExpr.prototype.isEqualNode = function isEqualNode(expected: ASTNode, path: TestPath)
{
	const next = nextPath(path, expected)
	matchTypeAndToken(this, expected, next).unwrap()

	const item = expected as ASTElseExpr
	this.block.isEqualNode(item.block, next).unwrap()
	return eqOk()
}

ASTIfStmt.prototype.isEqualNode = function isEqualNode(expected: ASTNode, path: TestPath)
{
	const next = nextPath(path, expected)
	matchTypeAndToken(this, expected, next).unwrap()

	const item = expected as ASTIfStmt
	this.ifExpr.isEqualNode(item.ifExpr, next).unwrap()
	undefinedEqual(this.elseExpr, item.elseExpr, 'elseExpr', next).unwrap()
	listEqual(this.elifExprs, item.elifExprs, 'elifExprs', next).unwrap()
	return eqOk()
}

ASTForStmt.prototype.isEqualNode = function isEqualNode(expected: ASTNode, path: TestPath)
{
	const next = nextPath(path, expected)
	matchTypeAndToken(this, expected, next).unwrap()

	const item = expected as ASTForStmt
	this.container.isEqualNode(item.container, next).unwrap()
	this.block.isEqualNode(item.block, next).unwrap()
	return eqOk()
}

ASTWhileStmt.prototype.isEqualNode = function isEqualNode(expected: ASTNode, path: TestPath)
{
	const next = nextPath(path, expected)
	matchTypeAndToken(this, expected, next).unwrap()

	const item = expected as ASTWhileStmt
	this.cond.isEqualNode(item.cond, next).unwrap()
	this.block.isEqualNode(item.block, next).unwrap()
	return eqOk()
}

ASTVisibility.prototype.isEqualNode = function isEqualNode(expected: ASTNode, path: TestPath)
{
	const next = nextPath(path, expected)
	matchTypeAndToken(this, expected, next).unwrap()

	const item = expected as ASTVisibility
	if (this.visibility !== item.visibility)
	{
		const expected = `Expected visibility type ${ASTVisibilityType[item.visibility]}`
		const received = `received ${ASTVisibilityType[this.visibility]}`
		return eqFail(`${expected}, ${received}`, next)
	}

	return eqOk()
}

ASTParams.prototype.isEqualNode = function isEqualNode(expected: ASTNode, path: TestPath)
{
	const next = nextPath(path, expected)
	matchTypeAndToken(this, expected, next).unwrap()

	const item = expected as ASTParams
	listEqual(this.parameters, item.parameters, 'parameters', next).unwrap()
	return eqOk()
}

ASTReturnType.prototype.isEqualNode = function isEqualNode(expected: ASTNode, path: TestPath)
{
	const next = nextPath(path, expected)
	matchTypeAndToken(this, expected, next).unwrap()

	const item = expected as ASTReturnType
	// TODO: storageSpec
	// undefinedEqual(this.functionTypeSpec, item.functionTypeSpec, "functionTypeSpec", next).unwrap()
	this.returnType.isEqualNode(item.returnType, next).unwrap()
	return eqOk()
}

ASTTemplate.prototype.isEqualNode = function isEqualNode(expected: ASTNode, path: TestPath)
{
	const next = nextPath(path, expected)
	matchTypeAndToken(this, expected, next).unwrap()

	const item = expected as ASTTemplate
	listEqual(this.parameters, item.parameters, 'parameters', next).unwrap()
	// TODO: symbol table
	// this.symbolTable.isEqualNode(item.symbolTable, next).unwrap()
	return eqOk()
}

ASTFunction.prototype.isEqualNode = function isEqualNode(expected: ASTNode, path: TestPath)
{
	const next = nextPath(path, expected)
	matchTypeAndToken(this, expected, next).unwrap()

	const item = expected as ASTFunction
	undefinedEqual(this.templateParams, item.templateParams, 'templateParams', next).unwrap()
	this.returnType.isEqualNode(item.returnType, next).unwrap()
	this.name.isEqualNode(item.name, next).unwrap()
	this.parameters.isEqualNode(item.parameters, next).unwrap()
	this.body.isEqualNode(item.body, next).unwrap()
	return eqOk()
}

ASTOperator.prototype.isEqualNode = function isEqualNode(expected: ASTNode, path: TestPath)
{
	const next = nextPath(path, expected)
	matchTypeAndToken(this, expected, next).unwrap()

	const item = expected as ASTOperator
	this.returnType.isEqualNode(item.returnType, next).unwrap();
	// Both ASTIdent and Token have the isEqualNode function so this should be safe
	(this.operator as ASTIdent).isEqualNode(item.operator as ASTIdent, next).unwrap()
	this.parameters.isEqualNode(item.parameters, next).unwrap()
	this.body.isEqualNode(item.body, next).unwrap()
	return eqOk()
}

ASTClass.prototype.isEqualNode = function isEqualNode(expected: ASTNode, path: TestPath)
{
	const next = nextPath(path, expected)
	matchTypeAndToken(this, expected, next).unwrap()

	const item = expected as ASTClass
	undefinedEqual(this.templateParams, item.templateParams, 'templateParams', next).unwrap()
	this.nameIdent.isEqualNode(item.nameIdent, next).unwrap()
	this.body.isEqualNode(item.body, next).unwrap()
	return eqOk()
}

ASTBlock.prototype.isEqualNode = function isEqualNode(expected: ASTNode, path: TestPath)
{
	const next = nextPath(path, expected)
	matchTypeAndToken(this, expected, next).unwrap()

	const item = expected as ASTBlock
	listEqual(this.statements, item.statements, 'statements', next).unwrap()
	// TODO: symbol table
	// this.symbolTable.isEqualNode(item.symbolTable, next).unwrap()
	return eqOk()
}
/* src/server/ast/statemets.ts end */

/* src/server/ast/literals.ts start */
ASTInt.prototype.isEqualNode = function isEqualNode(expected: ASTNode, path: TestPath)
{
	return matchTypeAndToken(this, expected, nextPath(path, expected))
}

ASTFloat.prototype.isEqualNode = function isEqualNode(expected: ASTNode, path: TestPath)
{
	const next = nextPath(path, expected)
	matchTypeAndToken(this, expected, next).unwrap()

	const item = expected as ASTFloat
	if (this.floatBits !== item.floatBits)
		return eqFail(`Expected floatBits ${item.floatBits}, received ${this.floatBits}`, next)

	return eqOk()
}

ASTStringLit.prototype.isEqualNode = function isEqualNode(expected: ASTNode, path: TestPath)
{
	const next = nextPath(path, expected)
	matchTypeAndToken(this, expected, next).unwrap()

	const recStr = this.toString()
	const expStr = expected.toString()
	if (recStr !== expStr)
		return eqFail(`Expected string ${expStr}, received ${recStr}`, next)

	return eqOk()
}

ASTCharLit.prototype.isEqualNode = function isEqualNode(expected: ASTNode, path: TestPath)
{
	return matchTypeAndToken(this, expected, nextPath(path, expected))
}

ASTBool.prototype.isEqualNode = function isEqualNode(expected: ASTNode, path: TestPath)
{
	return matchTypeAndToken(this, expected, nextPath(path, expected))
}

ASTNull.prototype.isEqualNode = function isEqualNode(expected: ASTNode, path: TestPath)
{
	return matchTypeAndToken(this, expected, nextPath(path, expected))
}
/* src/server/ast/literals.ts end */

/* src/server/ast/values.ts start */
ASTInvalid.prototype.isEqualNode = function isEqualNode(expected: ASTNode, path: TestPath)
{
	const next = nextPath(path, expected)
	matchTypeAndToken(this, expected, next).unwrap()

	return eqOk()
}

ASTIdent.prototype.isEqualNode = function isEqualNode(expected: ASTNode, path: TestPath)
{
	const next = nextPath(path, expected)
	matchTypeAndToken(this, expected, next).unwrap()

	const item = expected as ASTIdent
	undefinedEqual(this.symbol, item.symbol, 'symbol', next).unwrap()
	undefinedEqual(this.templateArgs, item.templateArgs, 'templateArgs', next).unwrap()
	return eqOk()
}

ASTDottedIdent.prototype.isEqualNode = function isEqualNode(expected: ASTNode, path: TestPath)
{
	const next = nextPath(path, expected)
	matchTypeAndToken(this, expected, next).unwrap()

	const item = expected as ASTDottedIdent
	listEqual(this.idents, item.idents, 'idents', next).unwrap()
	undefinedListEqual(this.symbolSeq, item.symbolSeq, 'symbolSeq', next).unwrap()
	return eqOk()
}

ASTStorage.prototype.isEqualNode = function isEqualNode(expected: ASTNode, path: TestPath)
{
	const next = nextPath(path, expected)
	matchTypeAndToken(this, expected, next).unwrap()

	const item = expected as ASTStorage
	undefinedEqual(this.staticSpec, item.staticSpec, 'staticSpec', next).unwrap()
	undefinedEqual(this.volatileSpec, item.volatileSpec, 'volatileSpec', next).unwrap()
	undefinedEqual(this.constSpec, item.constSpec, 'constSpec', next).unwrap()
	return eqOk()
}

ASTTypeDecl.prototype.isEqualNode = function isEqualNode(expected: ASTNode, path: TestPath)
{
	const next = nextPath(path, expected)
	matchTypeAndToken(this, expected, next).unwrap()
	// TODO: storagespec
	/* const item = expected as ASTTypeDecl
	undefinedEqual(this.storageSpec, item.storageSpec, "storageSpec", next).unwrap()
	*/
	return eqOk()
}

ASTIdentDef.prototype.isEqualNode = function isEqualNode(expected: ASTNode, path: TestPath)
{
	const next = nextPath(path, expected)
	matchTypeAndToken(this, expected, next).unwrap()

	const item = expected as ASTIdentDef
	undefinedEqual(this.symbol, item.symbol, 'symbol', next).unwrap()
	undefinedEqual(this.templateArgs, item.templateArgs, 'templateArgs', next).unwrap()
	this.identType.isEqualNode(item.identType, next).unwrap()
	return eqOk()
}

ASTIndex.prototype.isEqualNode = function isEqualNode(expected: ASTNode, path: TestPath)
{
	const next = nextPath(path, expected)
	matchTypeAndToken(this, expected, next).unwrap()

	const item = expected as ASTIndex
	this.target.isEqualNode(item.target, next).unwrap()
	this.index.isEqualNode(item.index, next).unwrap()
	return eqOk()
}

ASTSlice.prototype.isEqualNode = function isEqualNode(expected: ASTNode, path: TestPath)
{
	const next = nextPath(path, expected)
	matchTypeAndToken(this, expected, next).unwrap()

	const item = expected as ASTSlice
	this.target.isEqualNode(item.target, next).unwrap()
	undefinedEqual(this.begin, item.begin, 'begin', next).unwrap()
	undefinedEqual(this.end, item.end, 'end', next).unwrap()
	return eqOk()
}

ASTCallArguments.prototype.isEqualNode = function isEqualNode(expected: ASTNode, path: TestPath)
{
	const next = nextPath(path, expected)
	matchTypeAndToken(this, expected, next).unwrap()

	const item = expected as ASTCallArguments
	listEqual(this.arguments, item.arguments, 'arguments', next).unwrap()
	return eqOk()
}

ASTTemplateArguments.prototype.isEqualNode = function isEqualNode(expected: ASTNode, path: TestPath)
{
	const next = nextPath(path, expected)
	matchTypeAndToken(this, expected, next).unwrap()

	const item = expected as ASTTemplateArguments
	listEqual(this.arguments, item.arguments, 'arguments', next).unwrap()
	return eqOk()
}
/* src/server/ast/values.ts end */

/* src/server/ast/operations.ts start */
ASTFunctionCall.prototype.isEqualNode = function isEqualNode(expected: ASTNode, path: TestPath)
{
	const next = nextPath(path, expected)
	matchTypeAndToken(this, expected, next).unwrap()

	const item = expected as ASTFunctionCall
	this.args.isEqualNode(item.args, next).unwrap()
	this.functionNameIdent.isEqualNode(item.functionNameIdent, next).unwrap()
	undefinedEqual(this.templateArgs, item.templateArgs, 'templateArgs', next).unwrap()
	return eqOk()
}

ASTUnaryOp.prototype.isEqualNode = function isEqualNode(expected: ASTNode, path: TestPath)
{
	const next = nextPath(path, expected)
	matchTypeAndToken(this, expected, next).unwrap()

	const item = expected as ASTUnaryOp
	this.value.isEqualNode(item.value, next).unwrap()
	return eqOk()
}

ASTBinaryOp.prototype.isEqualNode = function isEqualNode(expected: ASTNode, path: TestPath)
{
	const next = nextPath(path, expected)
	matchTypeAndToken(this, expected, next).unwrap()

	const item = expected as ASTBinaryOp
	this.lhs.isEqualNode(item.lhs, next).unwrap()
	this.rhs.isEqualNode(item.rhs, next).unwrap()
	return eqOk()
}

ASTBetween.prototype.isEqualNode = function isEqualNode(expected: ASTNode, path: TestPath)
{
	const next = nextPath(path, expected)
	matchTypeAndToken(this, expected, next).unwrap()

	const item = expected as ASTBetween
	this.lhs.isEqualNode(item.lhs, next).unwrap()
	this.lop.isEqualNode(item.lop, next).unwrap()
	this.value.isEqualNode(item.value, next).unwrap()
	this.rop.isEqualNode(item.rop, next).unwrap()
	this.rhs.isEqualNode(item.rhs, next).unwrap()
	return eqOk()
}

ASTAssign.prototype.isEqualNode = function isEqualNode(expected: ASTNode, path: TestPath)
{
	const next = nextPath(path, expected)
	matchTypeAndToken(this, expected, next).unwrap()

	const item = expected as ASTAssign
	this.ident.isEqualNode(item.ident, next).unwrap()
	this.value.isEqualNode(item.value, next).unwrap()
	return eqOk()
}
/* src/server/ast/operations.ts end */

export function toBeEqualNode(received: ASTNode, expected: ASTNode)
{
	try
	{
		received.isEqualNode(expected, {path: 'root'}).unwrap()
		return {pass: true, message: () => ''}
	}
	catch (err)
	{
		// Javascript errors cannot pass objects, only strings.
		// So we have to dig out the information from it in a really hacky way
		const msgLine = (err as Error).toString().split('\n')[0].split('Error: ')
		const json = JSON.parse(msgLine[msgLine.length - 1])
		return {pass: false, message: () => json.message}
	}
}

export {}
