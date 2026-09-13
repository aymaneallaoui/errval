user, err := getUser(ctx, id)
if err != nil {
    return nil, fmt.Errorf("handler: %w", err)
}
var nf *NotFound
if errors.As(err, &nf) {
    respond(404, nf.ID)
}
