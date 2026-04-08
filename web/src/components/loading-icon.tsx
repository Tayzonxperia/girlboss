import { useEffect } from 'react'

declare module 'react' {
    namespace JSX {
        // noinspection JSUnusedGlobalSymbols
        interface IntrinsicElements {
            'l-grid': {
                size?: string | number
                color?: string | number
                speed?: string | number
            }
        }
    }
}

export default function LoadingIcon() {
    useEffect(() => {
        async function getLoader() {
            const { grid } = await import('ldrs')
            grid.register()
        }
        // noinspection JSIgnoredPromiseFromCall
        getLoader()
    }, [])
    return <l-grid color="black"></l-grid>
}
