#include <stdio.h>
void fmt(char *out, size_t n, const char *s) {
  snprintf(out, n, "%s", s);
}
