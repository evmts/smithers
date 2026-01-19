# Review: Human.tsx - Wrong Implementation Pattern

## File
[src/components/Human.tsx](file:///Users/williamcory/smithers/src/components/Human.tsx#L11-L34)

## Issue Description
The file contains a TODO comment acknowledging the implementation is wrong:

```tsx
// THIS IS WRONG! See docs for how this should be a useMutation like useHuman hook and async
```

The current implementation is a simple passthrough component that doesn't actually pause execution for human interaction as documented.

## Current Code
```tsx
export function Human(props: HumanProps): ReactNode {
  return (
    <human message={props.message}>
      {props.children}
    </human>
  )
}
```

## Suggested Fix
Implement as documented - create a proper async hook-based pattern:

```tsx
export function useHuman() {
  const { db } = useSmithers()
  
  return useMutation(async (options: { message: string }) => {
    const requestId = db.state.set('human_request', {
      message: options.message,
      status: 'pending',
      timestamp: Date.now()
    })
    
    // Poll for response
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const response = db.state.get(`human_response:${requestId}`)
        if (response?.status === 'approved') {
          clearInterval(checkInterval)
          resolve(response)
        } else if (response?.status === 'rejected') {
          clearInterval(checkInterval)
          reject(new Error('Human rejected'))
        }
      }, 500)
    })
  })
}
```
