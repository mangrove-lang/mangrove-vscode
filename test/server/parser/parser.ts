// SPDX-License-Identifier: BSD-3-Clause
import {readFileSync, readdirSync} from 'fs'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {ASTNode} from '../../../src/server/ast/types'
import {Parser} from '../../../src/server/parser/parser'
import {afterEach, expect, test, jest} from '@jest/globals'

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
	}
}

expect.extend({toBeValidSyntax})

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

test('Grove files with no syntax errors', () =>
{
	const error = jest.spyOn(global.console, 'error')

	const syntaxFiles = getSyntaxFiles()
	for (const file of syntaxFiles)
		expect(file).toBeValidSyntax()

	// TODO: print file name if spy detects or `console.error`
	expect(error).not.toHaveBeenCalled()
})

