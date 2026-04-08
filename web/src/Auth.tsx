import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useRef, type ComponentProps } from 'react'

type SubmitHandler = NonNullable<ComponentProps<'form'>['onSubmit']>

type LoginSuccess = {
    message: string
}

type LoginFailure = {
    error: string
}

function isLoginFailure(data: unknown): data is LoginFailure {
    return typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string'
}

function isLoginSuccess(data: unknown): data is LoginSuccess {
    return typeof data === 'object' && data !== null && 'message' in data && typeof data.message === 'string'
}

function formatUnknownError(err: unknown): string {
    if (err instanceof Error) return err.message
    return String(err)
}

export function Auth() {
    const authkeyinput = useRef<HTMLInputElement>(null)
    const error = useRef<HTMLDivElement>(null)

    const showError = (message: string) => {
        if (!error.current) return
        error.current.classList.remove('text-green-500', 'bg-green-100')
        error.current.classList.add('text-red-500', 'bg-red-100')
        error.current.textContent = message
        error.current.classList.remove('hidden')
    }

    const showSuccess = (message: string) => {
        if (!error.current) return
        error.current.classList.remove('text-red-500', 'bg-red-100')
        error.current.classList.add('text-green-500', 'bg-green-100')
        error.current.textContent = message
        error.current.classList.remove('hidden')
    }

    const login: SubmitHandler = async (e) => {
        e.preventDefault()
        if (!authkeyinput.current) return
        const authkey = authkeyinput.current.value
        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                body: JSON.stringify({ authkey }),
            })
            const data: unknown = await res.json()

            if (isLoginFailure(data)) {
                showError(data.error)
                return
            }

            if (!isLoginSuccess(data)) {
                showError('Unexpected response from server.')
                return
            }

            showSuccess(data.message)
            window.location.reload()
        } catch (err) {
            showError(formatUnknownError(err))
        }
    }

    return (
        <div className="mt-8 mx-auto w-full max-w-2xl text-left flex flex-col gap-4">
            <div
                ref={error}
                className={cn('text-red-500', 'text-sm', 'font-mono', 'bg-red-100 p-3 rounded-lg', 'hidden')}
            ></div>

            <form
                onSubmit={login}
                className="flex items-center gap-2 bg-card p-3 rounded-xl font-mono border border-input w-full"
            >
                <Input
                    ref={authkeyinput}
                    placeholder="Input AuthKey here..."
                    className={cn(
                        'w-full min-h-[25px] min-w-[400px] bg-card',
                        'border border-input rounded-xl p-3',
                        'font-mono resize-y',
                        'placeholder:text-muted-foreground'
                    )}
                />

                <Button type="submit" variant="secondary">
                    Login
                </Button>
            </form>
        </div>
    )
}
