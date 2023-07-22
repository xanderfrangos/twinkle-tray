import { useState } from "react"

export function useObject(initialState = {}) {

    const [state, setState] = useState(Object.assign({}, initialState))
    const applyState = (newState) => {
        setState(prevState => ({
            ...prevState,
            ...newState
        }))
    }

    return [state, applyState]
}

