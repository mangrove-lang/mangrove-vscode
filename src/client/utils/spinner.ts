import {window} from 'vscode'

export function startSpinner(message: string)
{
	window.setStatusBarMessage(`Mangrove: $(settings-gear~spin) ${message}`)
}

export function stopSpinner(message?: string)
{
	window.setStatusBarMessage(message ? `Mangrove: ${message}` : 'Mangrove')
}
