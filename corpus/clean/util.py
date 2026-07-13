"""Small, idiomatic utility module — clean baseline."""


def normalize(name):
    """Return a trimmed, lower-cased name."""
    return name.strip().lower()


def total_price(items):
    return sum(item.price for item in items)


def first_active(users):
    for user in users:
        if user.active:
            return user
    return None
