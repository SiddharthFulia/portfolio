// FenwickTrees (BIT) — point update + prefix sum via low-bit trick.
export const BIT_CODE = {
  pseudo: `function update(i, delta):
    while i <= n:
        bit[i] += delta
        i += i & -i     // low bit — climb to responsible parent

function prefix(r):
    s = 0
    while r > 0:
        s += bit[r]
        r -= r & -r     // low bit — descend accumulating
    return s`,

  c: `#include <stdio.h>
#define MAXN 32
static int bit[MAXN];
static int N;

void update(int i, int delta) {
    for (; i <= N; i += i & -i) bit[i] += delta;
}
int prefix(int r) {
    int s = 0;
    for (; r > 0; r -= r & -r) s += bit[r];
    return s;
}
int range(int l, int r) { return prefix(r) - prefix(l - 1); }

int main(void) {
    int a[] = {3, 1, 4, 1, 5, 9, 2, 6};
    N = 8;
    for (int i = 0; i < N; i++) update(i + 1, a[i]);   // build
    printf("prefix(8) = %d\\n", prefix(8));            // 31
    printf("range(3..6) = %d\\n", range(3, 6));        // 4+1+5+9 = 19
    update(3, 10);                                     // a[3]+=10
    printf("range(3..6) after +10 = %d\\n", range(3, 6));
    return 0;
}`,

  cpp: `#include <iostream>
#include <vector>

class BIT {
    std::vector<int> bit;
public:
    BIT(int n) : bit(n + 1, 0) {}
    void update(int i, int delta) {
        for (; i < (int)bit.size(); i += i & -i) bit[i] += delta;
    }
    int prefix(int r) {
        int s = 0;
        for (; r > 0; r -= r & -r) s += bit[r];
        return s;
    }
    int range(int l, int r) { return prefix(r) - prefix(l - 1); }
};

int main() {
    std::vector<int> a = {3, 1, 4, 1, 5, 9, 2, 6};
    BIT b(a.size());
    for (int i = 0; i < (int)a.size(); i++) b.update(i + 1, a[i]);
    std::cout << "prefix(8) = " << b.prefix(8) << "\\n";
    std::cout << "range(3..6) = " << b.range(3, 6) << "\\n";
    b.update(3, 10);
    std::cout << "range(3..6) after +10 = " << b.range(3, 6) << "\\n";
    return 0;
}`,

  python: `class BIT:
    def __init__(self, n):
        self.n = n; self.bit = [0] * (n + 1)
    def update(self, i, delta):
        while i <= self.n:
            self.bit[i] += delta
            i += i & -i
    def prefix(self, r):
        s = 0
        while r > 0:
            s += self.bit[r]; r -= r & -r
        return s
    def range(self, l, r): return self.prefix(r) - self.prefix(l - 1)

if __name__ == "__main__":
    a = [3, 1, 4, 1, 5, 9, 2, 6]
    b = BIT(len(a))
    for i, v in enumerate(a): b.update(i + 1, v)
    print("prefix(8) =", b.prefix(8))
    print("range(3..6) =", b.range(3, 6))
    b.update(3, 10)
    print("range(3..6) after +10 =", b.range(3, 6))`,

  java: `public class Main {
    static int[] bit; static int n;
    static void update(int i, int delta) {
        for (; i <= n; i += i & -i) bit[i] += delta;
    }
    static int prefix(int r) {
        int s = 0;
        for (; r > 0; r -= r & -r) s += bit[r];
        return s;
    }
    static int range(int l, int r) { return prefix(r) - prefix(l - 1); }

    public static void main(String[] args) {
        int[] a = {3, 1, 4, 1, 5, 9, 2, 6};
        n = a.length; bit = new int[n + 1];
        for (int i = 0; i < n; i++) update(i + 1, a[i]);
        System.out.println("prefix(8) = " + prefix(8));
        System.out.println("range(3..6) = " + range(3, 6));
        update(3, 10);
        System.out.println("range(3..6) after +10 = " + range(3, 6));
    }
}`,

  rust: `struct Bit { tree: Vec<i64>, n: usize }

impl Bit {
    fn new(n: usize) -> Self { Self { tree: vec![0; n + 1], n } }
    fn update(&mut self, mut i: usize, delta: i64) {
        while i <= self.n {
            self.tree[i] += delta;
            i += i & i.wrapping_neg();
        }
    }
    fn prefix(&self, mut r: usize) -> i64 {
        let mut s = 0;
        while r > 0 {
            s += self.tree[r];
            r -= r & r.wrapping_neg();
        }
        s
    }
    fn range(&self, l: usize, r: usize) -> i64 { self.prefix(r) - self.prefix(l - 1) }
}

fn main() {
    let a = [3i64, 1, 4, 1, 5, 9, 2, 6];
    let mut b = Bit::new(a.len());
    for (i, &v) in a.iter().enumerate() { b.update(i + 1, v); }
    println!("prefix(8) = {}", b.prefix(8));
    println!("range(3..6) = {}", b.range(3, 6));
    b.update(3, 10);
    println!("range(3..6) after +10 = {}", b.range(3, 6));
}`,
}

export const BIT_SAMPLES = [
  { name: 'Prefix sums', description: 'Build BIT + prefix + range + update',   stdin: '', expected: '' },
  { name: 'Single-slot', description: 'Update index 3, verify range changes',  stdin: '', expected: '' },
]
