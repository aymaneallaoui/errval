const [err, user] = await getUser(id)
if (err) {
  return fail(wrap(err, "handler"))
}

const nf = as(err, NotFound)
if (nf) {
  respond(404, nf.id)
}
