// Envolve handlers assíncronos para encaminhar erros ao middleware central.
function asyncHandler(fn) {
  return function handler(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
