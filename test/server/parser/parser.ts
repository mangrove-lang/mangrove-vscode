// SPDX-License-Identifier: BSD-3-Clause
import {readFileSync, readdirSync} from 'fs'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {ASTNode} from '../../../src/server/ast/types'
import {Parser} from '../../../src/server/parser/parser'
import {afterEach, expect, test, jest, describe} from '@jest/globals'

import {ASTAdd, ASTAssign, ASTFunctionCall, ASTRel} from '../../../src/server/ast/operations'
import {toBeEqualNode} from '../../testNodes'
import {Token, TokenType} from '../../../src/server/parser/types'
import {ASTIndex} from '../../../src/server/ast/values'
import {MangroveSymbol, SymbolTypes} from '../../../src/server/ast/symbolTable'
import
{
	ASTFunction,
	ASTIfExpr,
	ASTIfStmt,
	ASTReturnType,
} from '../../../src/server/ast/statements'
import
{
	astBlock,
	astBool,
	astCallArgs,
	astClass,
	astDottedIdent,
	astIdent,
	astIdentDef,
	astInt,
	astParams,
	astReturn,
	astTemplate,
	astTemplateArgs,
	astTypeDecl,
	stringLit,
} from '../../astNodeHelpers'

const syntaxDir = 'cases/syntax'

afterEach(() =>
{
	// restore the spy created with spyOn
	jest.restoreAllMocks()
})

// Custom jest assertion
function toBeValidSyntax(file: string)
{
	const parser = parserFor(file)
	const tokens: ASTNode[] = []
	for (const node of parser.parse())
		tokens.push(node)

	const errCount = parser.syntaxErrors.length

	if (errCount !== 0)
	{
		return {
			message: () => `File '${syntaxDir}/${file}' had ${errCount} syntax errors. Expected 0.`,
			pass: false,
		}
	}

	return {
		message: () => `File '${syntaxDir}/${file}' had ${errCount} syntax errors. Expected 0.`,
		pass: true,
	}
}

// Extend expect module so typescript understands that toBeValidSyntax exists in expect
declare module 'expect'
{
	interface Matchers<R>
	{
		toBeValidSyntax(): R;
		toBeEqualNode(expected: ASTNode): R;
	}
}

expect.extend({toBeValidSyntax, toBeEqualNode})

function parserFor(file: string): Parser
{
	const fileName = `${__dirname}/../../${syntaxDir}/${file}`
	const content = readFileSync(fileName, 'utf-8')

	return new Parser(TextDocument.create(fileName, 'mangrove', 1, content))
}

function getSyntaxFiles(): string[]
{
	return readdirSync(`${__dirname}/../../${syntaxDir}/`).filter(file => !file.startsWith('fixme_'))
}

describe('Basic syntax tests', () =>
{
	test('Grove files with no syntax errors', () =>
	{
		const error = jest.spyOn(global.console, 'error')

		const syntaxFiles = getSyntaxFiles()
		for (const file of syntaxFiles)
			expect(file).toBeValidSyntax()

		// TODO: print file name if spy detects or `console.error`
		expect(error).not.toHaveBeenCalled()
	})
})

describe('AST Nodes tests', () =>
{
	test('genericFunctonCallComparisonSimple.grove parsing', () =>
	{
		// Parse the source file
		const parser = parserFor('genericFunctonCallComparisonSimple.grove')
		const tokens: ASTNode[] = []
		for (const node of parser.parse())
			tokens.push(node)

		// Manually construct the expected structure
		const func = new ASTFunction(
			Token.from(TokenType.functionDef, 'function'),
			astIdentDef('simple', 'simple', SymbolTypes.function),
			undefined,
			astParams(),
			new ASTReturnType(
				Token.from(TokenType.arrow),
				undefined,
				astTypeDecl('Bool'),
			),
			astBlock(parser, [
				new ASTIfStmt(
					new ASTIfExpr(
						Token.from(TokenType.ifStmt, 'if'),
						new ASTRel(
							new ASTFunctionCall(
								astDottedIdent(['foo', 'bar']),
								astCallArgs(),
								astTemplateArgs([astIdent('zar')]),
							),
							Token.from(TokenType.relOp, '<'),
							new ASTFunctionCall(
								astDottedIdent(['foo', 'bar']),
								astCallArgs(),
								astTemplateArgs([astIdent('foo')]),
							),
						),
						astReturn(astBool('false')),
					),
					[],
				),
				astReturn(astBool('true')),
			]),
		)

		// Make sure they are equal
		expect(tokens[0]).toBeEqualNode(func)
	})

	test('genericFunctionCallComparisonStress.grove parsing', () =>
	{
		// Parse the source file
		const parser = parserFor('genericFunctionCallComparisonStress.grove')
		const tokens: ASTNode[] = []
		for (const node of parser.parse())
			tokens.push(node)

		// Manually construct the expected structure
		const func = new ASTFunction(
			Token.from(TokenType.functionDef, 'function'),
			astIdentDef('stress', 'stress', SymbolTypes.function),
			undefined,
			astParams(),
			new ASTReturnType(
				Token.from(TokenType.arrow),
				undefined,
				astTypeDecl('Bool'),
			),
			astBlock(parser, [
				new ASTIfStmt(
					new ASTIfExpr(
						Token.from(TokenType.ifStmt, 'if'),
						new ASTRel(
							new ASTFunctionCall(
								astDottedIdent(['bar', 'inbar']),
								astCallArgs(),
								astTemplateArgs([
									new ASTFunctionCall(
										astIdent('foo'),
										astCallArgs(),
										astTemplateArgs([
											new ASTFunctionCall(
												astIdent('zar'),
												astCallArgs(),
											),
											new ASTIndex(
												astDottedIdent(['duck', 'pond']),
												astInt('1'),
											),
										]),
									),
								]),
							),
							Token.from(TokenType.relOp, '<'),
							new ASTFunctionCall(
								astIdent('bar'),
								astCallArgs(),
								astTemplateArgs([
									new ASTFunctionCall(
										astIdent('foo'),
										astCallArgs(),
										astTemplateArgs([
											new ASTFunctionCall(
												astIdent('zar'),
												astCallArgs(),
											),
											new ASTIndex(
												astIdent('duck'),
												astInt('2'),
											),
										]),
									),
								]),
							),
						),
						astBlock(parser, [astReturn(astBool('false'))]),
					),
					[],
				),
				astReturn(astBool('true')),
			]),
		)

		const classBlock = astBlock(parser, [func])
		// Make sure they are equal
		expect(tokens[0]).toBeEqualNode(astClass('Foo', classBlock))
	})

	test('genericFunctionCallRecusive.grove parsing', () =>
	{
		// Parse the source file
		const parser = parserFor('genericFunctionCallRecusive.grove')
		const tokens: ASTNode[] = []
		for (const node of parser.parse())
			tokens.push(node)

		// Manually construct the expected structure
		const func = new ASTFunction(
			Token.from(TokenType.functionDef, 'function'),
			astIdentDef('write', 'write', SymbolTypes.function),
			astTemplate(parser, [
				astIdentDef('type', 'T', SymbolTypes.auto | SymbolTypes.type),
				astIdentDef('type', 'U', SymbolTypes.auto | SymbolTypes.pack | SymbolTypes.type),
			]),
			astParams([
				// FIXME: why is this invalid, it should be a reference
				astIdentDef('ConsoleStream', 'stream', SymbolTypes.invalid),
				astIdentDef('T', 'value', SymbolTypes.auto),
				astIdentDef('U', 'values', SymbolTypes.auto | SymbolTypes.pack),
			]),
			new ASTReturnType(
				Token.from(TokenType.arrow),
				undefined,
				astTypeDecl('none', TokenType.noneType),
			),
			astBlock(parser, [
				new ASTFunctionCall(
					astDottedIdent(['stream', 'write'], [new MangroveSymbol('stream')]),
					astCallArgs([astIdent('value', SymbolTypes.auto)]),
				),
				new ASTFunctionCall(
					astIdent('write', SymbolTypes.function),
					astCallArgs([
						// FIXME: stream should be valid symbol
						astIdent('stream', SymbolTypes.invalid),
						astIdent('values', SymbolTypes.auto | SymbolTypes.pack),
					]),
				),
			]),
		)
		// Make sure they are equal
		expect(tokens[0]).toBeEqualNode(func)
	})

	test('genericFunctionDefinition.grove parsing', () =>
	{
		// Parse the source file
		const parser = parserFor('genericFunctionDefinition.grove')
		const tokens: ASTNode[] = []
		for (const node of parser.parse())
			tokens.push(node)

		// Manually construct the expected structure
		const func = new ASTFunction(
			Token.from(TokenType.functionDef, 'function'),
			astIdentDef('trace', 'trace', SymbolTypes.function),
			astTemplate(parser, [
				astIdentDef('type', 'T', SymbolTypes.auto | SymbolTypes.pack | SymbolTypes.type),
			]),
			astParams([astIdentDef('T', 'values', SymbolTypes.auto | SymbolTypes.pack)]),
			new ASTReturnType(
				Token.from(TokenType.arrow),
				undefined,
				astTypeDecl('none', TokenType.noneType),
			),
			astBlock(parser),
		)
		// Make sure they are equal
		expect(tokens[0]).toBeEqualNode(func)
	})

	test('globalConstInit.grove parsing', () =>
	{
		// Parse the source file
		const parser = parserFor('globalConstInit.grove')
		const tokens: ASTNode[] = []
		for (const node of parser.parse())
			tokens.push(node)

		// Manually construct the expected structure
		const newClass = astClass('NoNewline', astBlock(parser))
		// Make sure they are equal
		expect(tokens[0]).toBeEqualNode(newClass)
		expect(tokens[1]).toBeEqualNode(new ASTAssign(
			Token.from(TokenType.assignOp, '='),
			astIdentDef('auto', 'noNewline', SymbolTypes.auto),
			new ASTFunctionCall(astIdent('NoNewline', SymbolTypes.type | SymbolTypes.struct), astCallArgs()),
		))
	})

	test('globalConstString.grove parsing', () =>
	{
		// Parse the source file
		const parser = parserFor('globalConstString.grove')
		const tokens: ASTNode[] = []
		for (const node of parser.parse())
			tokens.push(node)

		// Manually construct the expected structure
		const assign = new ASTAssign(
			Token.from(TokenType.assignOp, '='),
			astIdentDef('String', 'fooBar', SymbolTypes.string),
			stringLit('fooBar'),
		)

		// Make sure they are equal
		expect(tokens[0]).toBeEqualNode(assign)
	})

	test('simpleAddFunction.grove parsing', () =>
	{
		// Parse the source file
		const parser = parserFor('simpleAddFunction.grove')
		const tokens: ASTNode[] = []
		for (const node of parser.parse())
			tokens.push(node)

		// Manually construct the expected structure
		const func = new ASTFunction(
			Token.from(TokenType.functionDef, 'function'),
			astIdentDef('add', 'add', SymbolTypes.function),
			undefined,
			astParams([
				astIdentDef('Int32', 'a', SymbolTypes.int32Bit),
				astIdentDef('Int32', 'b', SymbolTypes.int32Bit),
			]),
			new ASTReturnType(
				Token.from(TokenType.arrow),
				undefined,
				astTypeDecl('Int32'),
			),
			astBlock(parser, [
				astReturn(
					new ASTAdd(
						astIdent('a', SymbolTypes.int32Bit),
						Token.from(TokenType.addOp, '+'),
						astIdent('b', SymbolTypes.int32Bit),
					),
				),
			]),
		)

		// Make sure they are equal
		expect(tokens[0]).toBeEqualNode(func)
	})

	test('simpleCompareFunction.grove parsing', () =>
	{
		// Parse the source file
		const parser = parserFor('simpleCompareFunction.grove')
		const tokens: ASTNode[] = []
		for (const node of parser.parse())
			tokens.push(node)

		// Manually construct the expected structure
		const func = new ASTFunction(
			Token.from(TokenType.functionDef, 'function'),
			astIdentDef('compare', 'compare', SymbolTypes.function),
			undefined,
			astParams([
				astIdentDef('Int32', 'a', SymbolTypes.int32Bit),
				astIdentDef('Int32', 'b', SymbolTypes.int32Bit),
			]),
			new ASTReturnType(
				Token.from(TokenType.arrow),
				undefined,
				astTypeDecl('Bool'),
			),
			astBlock(parser, [
				astReturn(
					new ASTRel(
						astIdent('a', SymbolTypes.int32Bit),
						Token.from(TokenType.relOp, '>'),
						astIdent('b', SymbolTypes.int32Bit),
					),
				),
			]),
		)

		// Make sure they are equal
		expect(tokens[0]).toBeEqualNode(func)
	})
})
