// HashTables — separate chaining insert + linear-probe insert.
export const HASH_CHAIN_CODE = {
  pseudo: `function insert(k, v):
    b = hash(k) mod capacity
    for entry in table[b]:
        if entry.k == k: entry.v = v; return
    table[b].append({k, v})`,

  c: `#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#define CAP 16

typedef struct Node { char *k; int v; struct Node *next; } Node;
static Node *table[CAP];

// djb2 — small, fast, good on ASCII.
static unsigned h_str(const char *s) {
    unsigned h = 5381;
    for (; *s; s++) h = ((h << 5) + h) + (unsigned char)*s;
    return h;
}

void insert(const char *k, int v) {
    unsigned b = h_str(k) % CAP;
    for (Node *n = table[b]; n; n = n->next)
        if (strcmp(n->k, k) == 0) { n->v = v; return; }
    Node *n = malloc(sizeof(Node));
    n->k = strdup(k); n->v = v; n->next = table[b];
    table[b] = n;
}

int get(const char *k) {
    unsigned b = h_str(k) % CAP;
    for (Node *n = table[b]; n; n = n->next)
        if (strcmp(n->k, k) == 0) return n->v;
    return -1;
}

int main(void) {
    insert("apple", 1);
    insert("banana", 2);
    insert("cherry", 3);
    insert("apple", 99);   // overwrite
    printf("apple=%d\\n", get("apple"));
    printf("banana=%d\\n", get("banana"));
    printf("cherry=%d\\n", get("cherry"));
    printf("missing=%d\\n", get("nope"));
    return 0;
}`,

  cpp: `#include <iostream>
#include <string>
#include <unordered_map>

int main() {
    std::unordered_map<std::string, int> t;
    t["apple"] = 1;
    t["banana"] = 2;
    t["cherry"] = 3;
    t["apple"] = 99;   // overwrite
    for (const auto& k : {std::string("apple"), std::string("banana"), std::string("cherry"), std::string("nope")}) {
        auto it = t.find(k);
        std::cout << k << "=" << (it == t.end() ? -1 : it->second) << "\\n";
    }
    return 0;
}`,

  python: `class HashTable:
    def __init__(self, cap: int = 16) -> None:
        self.cap = cap
        self._buckets = [[] for _ in range(cap)]

    def insert(self, k, v):
        b = hash(k) % self.cap
        for i, (kk, _) in enumerate(self._buckets[b]):
            if kk == k:
                self._buckets[b][i] = (k, v); return
        self._buckets[b].append((k, v))

    def get(self, k):
        b = hash(k) % self.cap
        for kk, vv in self._buckets[b]:
            if kk == k: return vv
        return -1

if __name__ == "__main__":
    t = HashTable()
    for k, v in [("apple", 1), ("banana", 2), ("cherry", 3), ("apple", 99)]:
        t.insert(k, v)
    for k in ["apple", "banana", "cherry", "nope"]:
        print(f"{k}={t.get(k)}")`,

  java: `import java.util.HashMap;
import java.util.Map;

public class Main {
    public static void main(String[] args) {
        Map<String, Integer> t = new HashMap<>();
        t.put("apple", 1);
        t.put("banana", 2);
        t.put("cherry", 3);
        t.put("apple", 99);   // overwrite
        for (String k : new String[]{"apple", "banana", "cherry", "nope"}) {
            System.out.println(k + "=" + t.getOrDefault(k, -1));
        }
    }
}`,

  rust: `use std::collections::HashMap;

fn main() {
    let mut t: HashMap<String, i32> = HashMap::new();
    t.insert("apple".into(), 1);
    t.insert("banana".into(), 2);
    t.insert("cherry".into(), 3);
    t.insert("apple".into(), 99);   // overwrite
    for k in ["apple", "banana", "cherry", "nope"] {
        println!("{}={}", k, t.get(k).copied().unwrap_or(-1));
    }
}`,
}

export const HASH_CHAIN_SAMPLES = [
  { name: 'Basic',      description: 'Insert 3 keys + one overwrite', stdin: '', expected: '' },
  { name: 'Missing',    description: 'Get on non-existent key',       stdin: '', expected: '' },
]

export const HASH_PROBE_CODE = {
  pseudo: `function insert(k, v):
    i = hash(k) mod capacity
    while arr[i] is set and arr[i].k != k:
        i = (i + 1) mod capacity   // linear probe
    arr[i] = {k, v}`,

  c: `#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#define CAP 16

typedef struct { char *k; int v; } Slot;
static Slot arr[CAP];

static unsigned h_str(const char *s) {
    unsigned h = 5381;
    for (; *s; s++) h = ((h << 5) + h) + (unsigned char)*s;
    return h;
}

void insert(const char *k, int v) {
    unsigned i = h_str(k) % CAP;
    while (arr[i].k && strcmp(arr[i].k, k) != 0)
        i = (i + 1) % CAP;    // linear probe
    if (!arr[i].k) arr[i].k = strdup(k);
    arr[i].v = v;
}

int get(const char *k) {
    unsigned i = h_str(k) % CAP;
    while (arr[i].k) {
        if (strcmp(arr[i].k, k) == 0) return arr[i].v;
        i = (i + 1) % CAP;
    }
    return -1;
}

int main(void) {
    insert("cat", 1); insert("dog", 2); insert("bird", 3);
    insert("cat", 42);   // overwrite
    printf("cat=%d\\n", get("cat"));
    printf("dog=%d\\n", get("dog"));
    printf("bird=%d\\n", get("bird"));
    return 0;
}`,

  cpp: `#include <iostream>
#include <string>
#include <vector>
#include <functional>

struct Slot { std::string k; int v; bool used; };

class ProbeTable {
    std::vector<Slot> arr{16};
public:
    void insert(const std::string& k, int v) {
        size_t i = std::hash<std::string>{}(k) % arr.size();
        while (arr[i].used && arr[i].k != k)
            i = (i + 1) % arr.size();
        arr[i] = {k, v, true};
    }
    int get(const std::string& k) const {
        size_t i = std::hash<std::string>{}(k) % arr.size();
        while (arr[i].used) {
            if (arr[i].k == k) return arr[i].v;
            i = (i + 1) % arr.size();
        }
        return -1;
    }
};

int main() {
    ProbeTable t;
    t.insert("cat", 1); t.insert("dog", 2); t.insert("bird", 3);
    t.insert("cat", 42);
    for (const std::string& k : {"cat", "dog", "bird"})
        std::cout << k << "=" << t.get(k) << "\\n";
    return 0;
}`,

  python: `class ProbeTable:
    def __init__(self, cap: int = 16) -> None:
        self.cap = cap
        self._arr = [None] * cap

    def insert(self, k, v):
        i = hash(k) % self.cap
        while self._arr[i] is not None and self._arr[i][0] != k:
            i = (i + 1) % self.cap
        self._arr[i] = (k, v)

    def get(self, k):
        i = hash(k) % self.cap
        while self._arr[i] is not None:
            if self._arr[i][0] == k: return self._arr[i][1]
            i = (i + 1) % self.cap
        return -1

if __name__ == "__main__":
    t = ProbeTable()
    for k, v in [("cat", 1), ("dog", 2), ("bird", 3), ("cat", 42)]:
        t.insert(k, v)
    for k in ["cat", "dog", "bird"]:
        print(f"{k}={t.get(k)}")`,

  java: `public class Main {
    static class Slot { String k; int v; }
    static Slot[] arr = new Slot[16];

    static void insert(String k, int v) {
        int i = Math.floorMod(k.hashCode(), arr.length);
        while (arr[i] != null && !arr[i].k.equals(k))
            i = (i + 1) % arr.length;
        Slot s = arr[i] != null ? arr[i] : new Slot();
        s.k = k; s.v = v;
        arr[i] = s;
    }

    static int get(String k) {
        int i = Math.floorMod(k.hashCode(), arr.length);
        while (arr[i] != null) {
            if (arr[i].k.equals(k)) return arr[i].v;
            i = (i + 1) % arr.length;
        }
        return -1;
    }

    public static void main(String[] args) {
        insert("cat", 1); insert("dog", 2); insert("bird", 3);
        insert("cat", 42);
        for (String k : new String[]{"cat", "dog", "bird"})
            System.out.println(k + "=" + get(k));
    }
}`,

  rust: `use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

fn h(k: &str, cap: usize) -> usize {
    let mut h = DefaultHasher::new(); k.hash(&mut h);
    (h.finish() as usize) % cap
}

fn main() {
    let cap = 16;
    let mut arr: Vec<Option<(String, i32)>> = vec![None; cap];

    let insert = |arr: &mut Vec<Option<(String, i32)>>, k: &str, v: i32| {
        let mut i = h(k, cap);
        loop {
            match &arr[i] {
                Some((kk, _)) if kk != k => i = (i + 1) % cap,
                _ => break,
            }
        }
        arr[i] = Some((k.to_string(), v));
    };
    let get = |arr: &Vec<Option<(String, i32)>>, k: &str| -> i32 {
        let mut i = h(k, cap);
        while let Some((kk, vv)) = &arr[i] {
            if kk == k { return *vv; }
            i = (i + 1) % cap;
        }
        -1
    };

    insert(&mut arr, "cat", 1);
    insert(&mut arr, "dog", 2);
    insert(&mut arr, "bird", 3);
    insert(&mut arr, "cat", 42);
    for k in ["cat", "dog", "bird"] {
        println!("{}={}", k, get(&arr, k));
    }
}`,
}

export const HASH_PROBE_SAMPLES = [
  { name: 'Three keys',   description: 'Insert cat/dog/bird with overwrite', stdin: '', expected: '' },
  { name: 'Overwrite',    description: 'Same key inserted twice — second wins', stdin: '', expected: '' },
]
