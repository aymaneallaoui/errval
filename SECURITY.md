# Security

errnil has no dependencies, does no I/O, and never evaluates input. The
attack surface is small, but it is not zero: it creates objects from data you
pass in, and it walks `cause` chains on errors that may have come from
anywhere.

## Reporting

If you think you found a security problem, please do not open a public issue.
Use GitHub's private vulnerability reporting on this repository, or email the
address on the maintainer's GitHub profile. You will get an acknowledgement
within a few days and a fix or a clear answer within two weeks for anything
confirmed.

## Things worth knowing

- `TaggedError` copies the own enumerable properties of the props object onto
  the error with a plain loop. Keys are not filtered. Do not pass
  user-controlled objects as props without picking the fields you mean.
- `is` and `as` follow `cause` and `errors` properties. They keep a visited
  set, so cycles terminate, but they will happily read those properties on
  any object you hand them.
- `toJSON` serialises own enumerable props and the cause. If you attach
  secrets to an error, they will end up in your logs.
- `attempt` keeps the thrown value inside `Thrown.value` untouched.

## Supported versions

Only the latest minor release gets fixes.
