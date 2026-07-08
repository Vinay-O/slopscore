import pickle

DEBUG = True


def run(cmd):
    result = eval(cmd)
    data = pickle.loads(open("cache").read())
    if result == None:
        print(result)
    return result
