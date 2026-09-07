// HashTables — separate chaining insert + linear-probe insert.
export const HASH_CHAIN_CODE = {
  pseudo: `function insert(k, v):
    b = hash(k) mod capacity
    for entry in table[b]:
        if entry.k == k: entry.v = v; return
    table[b].append({k, v})`,

  c: `#include <stdlib.h>
#include <string.h>
#define CAP 16

typedef struct Node { char *k; int v; struct Node *next; } Node;
static Node *table[CAP];

// djb2 — small, fast, good on ASCII.
static unsigned hash(const char *s) {
    unsigned h = 5381;
    for (; *s; s++) h = ((h << 5) + h) + (unsigned char)*s;
    return h;
}

void insert(const char *k, int v) {
    unsigned b = hash(k) % CAP;
    for (Node *n = table[b]; n; n = n->next)
        if (strcmp(n->k, k) == 0) { n->v = v; return; }
    Node *n = malloc(sizeof(Node));
    n->k = strdup(k); n->v = v; n->next = table[b];
    table[b] = n;
}`,

  cpp: `#include <unordered_map>
#include <string>

// std::unordered_map is a separate-chaining hash table (buckets of nodes).
std::unordered_map<std::string, int> table;

void insert(const std::string& k, int v) {
    table[k] = v;    // one call — insert or overwrite
}`,

  python: `class HashTable:
    def __init__(self, cap: int = 16) -> None:
        self.cap = cap
        self._buckets: list[list[tuple[str, int]]] = [[] for _ in range(cap)]

    def insert(self, k: str, v: int) -> None:
        b = hash(k) % self.cap
        for i, (kk, _) in enumerate(self._buckets[b]):
            if kk == k:
                self._buckets[b][i] = (k, v)      # overwrite
                return
        self._buckets[b].append((k, v))`,

  java: `import java.util.HashMap;
import java.util.Map;

// Java's HashMap is separate-chaining. Since Java 8 it upgrades a bucket
// to a red-black tree once it exceeds 8 nodes with a hostile hash.
Map<String, Integer> table = new HashMap<>();

public static void insert(Map<String, Integer> t, String k, int v) {
    t.put(k, v);    // one call — insert or overwrite
}`,

  rust: `use std::collections::HashMap;

// std::collections::HashMap uses hashbrown (Google's SwissTable) —
// open addressing with SIMD probing under the hood.
pub fn insert(t: &mut HashMap<String, i32>, k: String, v: i32) {
    t.insert(k, v);   // returns Option<old_v>
}`,
}

export const HASH_PROBE_CODE = {
  pseudo: `function insert(k, v):
    i = hash(k) mod capacity
    while arr[i] is set and arr[i].k != k:
        i = (i + 1) mod capacity   // linear probe
    arr[i] = {k, v}`,

  c: `#include <string.h>
#define CAP 16
#define TOMB ((char*)-1)

typedef struct { char *k; int v; } Slot;
static Slot arr[CAP];

static unsigned hash(const char *s) {
    unsigned h = 5381;
    for (; *s; s++) h = ((h << 5) + h) + (unsigned char)*s;
    return h;
}

void insert(const char *k, int v) {
    unsigned i = hash(k) % CAP;
    while (arr[i].k && arr[i].k != TOMB && strcmp(arr[i].k, k) != 0)
        i = (i + 1) % CAP;    // linear probe
    arr[i].k = strdup(k); arr[i].v = v;
}`,

  cpp: `#include <string>
#include <vector>
#include <functional>

struct Slot { std::string k; int v; bool used; };

class ProbeTable {
    std::vector<Slot> arr{16};
public:
    void insert(const std::string& k, int v) {
        size_t i = std::hash<std::string>{}(k) % arr.size();
        while (arr[i].used && arr[i].k != k)
            i = (i + 1) % arr.size();     // linear probe
        arr[i] = {k, v, true};
    }
};`,

  python: `class ProbeTable:
    _TOMB = object()
    def __init__(self, cap: int = 16) -> None:
        self.cap = cap
        self._arr: list = [None] * cap

    def insert(self, k: str, v: int) -> None:
        i = hash(k) % self.cap
        while self._arr[i] is not None and self._arr[i] is not self._TOMB \\
                and self._arr[i][0] != k:
            i = (i + 1) % self.cap        # linear probe
        self._arr[i] = (k, v)`,

  java: `public class ProbeTable {
    private static class Slot { String k; int v; }
    private final Slot[] arr = new Slot[16];

    public void insert(String k, int v) {
        int i = Math.floorMod(k.hashCode(), arr.length);
        while (arr[i] != null && !arr[i].k.equals(k))
            i = (i + 1) % arr.length;      // linear probe
        Slot s = new Slot(); s.k = k; s.v = v;
        arr[i] = s;
    }
}`,

  rust: `use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

pub struct ProbeTable { arr: Vec<Option<(String, i32)>> }

impl ProbeTable {
    pub fn new(cap: usize) -> Self { Self { arr: vec![None; cap] } }

    pub fn insert(&mut self, k: String, v: i32) {
        let cap = self.arr.len();
        let mut h = DefaultHasher::new(); k.hash(&mut h);
        let mut i = (h.finish() as usize) % cap;
        // linear probe: walk forward until the slot is empty or matches.
        while let Some((kk, _)) = &self.arr[i] {
            if *kk == k { break; }
            i = (i + 1) % cap;
        }
        self.arr[i] = Some((k, v));
    }
}`,
}
