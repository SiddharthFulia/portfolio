// Sorting — Bubble, Counting, Quick, Merge, Radix. All runnable end-to-end.

const SAMPLE = "[5, 2, 8, 1, 9, 3, 7, 4, 6]  // expected sorted [1..9]";

export const CODE = {
  bubble: {
    pseudo: `for i = 0 .. n-2:
  swapped = false
  for j = 0 .. n-i-2:
    if a[j] > a[j+1]:
      swap a[j], a[j+1]
      swapped = true
  if not swapped: break`,

    c: `#include <stdio.h>
#include <stdbool.h>

void bubble_sort(int a[], int n) {
    for (int i = 0; i < n - 1; i++) {
        bool swapped = false;
        for (int j = 0; j < n - i - 1; j++) {
            if (a[j] > a[j + 1]) {
                int t = a[j]; a[j] = a[j + 1]; a[j + 1] = t;
                swapped = true;
            }
        }
        if (!swapped) break;
    }
}

int main(void) {
    int a[] = {5, 2, 8, 1, 9, 3, 7, 4, 6};
    int n = sizeof(a) / sizeof(a[0]);
    bubble_sort(a, n);
    printf("sorted:");
    for (int i = 0; i < n; i++) printf(" %d", a[i]);
    printf("\\n");
    return 0;
}`,

    cpp: `#include <iostream>
#include <vector>
#include <utility>

void bubble_sort(std::vector<int>& a) {
    int n = (int)a.size();
    for (int i = 0; i < n - 1; ++i) {
        bool swapped = false;
        for (int j = 0; j < n - i - 1; ++j) {
            if (a[j] > a[j + 1]) { std::swap(a[j], a[j + 1]); swapped = true; }
        }
        if (!swapped) break;
    }
}

int main() {
    std::vector<int> a = {5, 2, 8, 1, 9, 3, 7, 4, 6};
    bubble_sort(a);
    std::cout << "sorted:";
    for (int x : a) std::cout << " " << x;
    std::cout << "\\n";
    return 0;
}`,

    python: `def bubble_sort(a):
    n = len(a)
    for i in range(n - 1):
        swapped = False
        for j in range(n - i - 1):
            if a[j] > a[j + 1]:
                a[j], a[j + 1] = a[j + 1], a[j]
                swapped = True
        if not swapped: break
    return a

if __name__ == "__main__":
    a = [5, 2, 8, 1, 9, 3, 7, 4, 6]
    bubble_sort(a)
    print("sorted:", a)`,

    java: `public class Main {
    public static void bubbleSort(int[] a) {
        int n = a.length;
        for (int i = 0; i < n - 1; i++) {
            boolean swapped = false;
            for (int j = 0; j < n - i - 1; j++) {
                if (a[j] > a[j + 1]) {
                    int t = a[j]; a[j] = a[j + 1]; a[j + 1] = t;
                    swapped = true;
                }
            }
            if (!swapped) break;
        }
    }
    public static void main(String[] args) {
        int[] a = {5, 2, 8, 1, 9, 3, 7, 4, 6};
        bubbleSort(a);
        System.out.print("sorted:");
        for (int x : a) System.out.print(" " + x);
        System.out.println();
    }
}`,

    rust: `fn bubble_sort(a: &mut [i32]) {
    let n = a.len();
    for i in 0..n.saturating_sub(1) {
        let mut swapped = false;
        for j in 0..n - i - 1 {
            if a[j] > a[j + 1] { a.swap(j, j + 1); swapped = true; }
        }
        if !swapped { break; }
    }
}

fn main() {
    let mut a = [5, 2, 8, 1, 9, 3, 7, 4, 6];
    bubble_sort(&mut a);
    println!("sorted: {:?}", a);
}`,
  },

  counting: {
    pseudo: `k = max(a)
count[0..k] = 0
for x in a: count[x] += 1
out = 0
for v = 0 .. k:
  while count[v] > 0:
    a[out++] = v
    count[v] -= 1`,

    c: `#include <stdio.h>
#include <stdlib.h>

void counting_sort(int a[], int n) {
    if (n <= 0) return;
    int max = a[0];
    for (int i = 1; i < n; i++) if (a[i] > max) max = a[i];
    int* count = calloc(max + 1, sizeof(int));
    for (int i = 0; i < n; i++) count[a[i]]++;
    int out = 0;
    for (int v = 0; v <= max; v++)
        while (count[v]-- > 0) a[out++] = v;
    free(count);
}

int main(void) {
    int a[] = {4, 2, 2, 8, 3, 3, 1};
    int n = 7;
    counting_sort(a, n);
    printf("sorted:");
    for (int i = 0; i < n; i++) printf(" %d", a[i]);
    printf("\\n");
    return 0;
}`,

    cpp: `#include <iostream>
#include <vector>
#include <algorithm>

void counting_sort(std::vector<int>& a) {
    if (a.empty()) return;
    int k = *std::max_element(a.begin(), a.end());
    std::vector<int> count(k + 1, 0);
    for (int x : a) count[x]++;
    int out = 0;
    for (int v = 0; v <= k; ++v)
        while (count[v]-- > 0) a[out++] = v;
}

int main() {
    std::vector<int> a = {4, 2, 2, 8, 3, 3, 1};
    counting_sort(a);
    std::cout << "sorted:";
    for (int x : a) std::cout << " " << x;
    std::cout << "\\n";
    return 0;
}`,

    python: `def counting_sort(a):
    if not a: return a
    k = max(a)
    count = [0] * (k + 1)
    for x in a: count[x] += 1
    out = 0
    for v in range(k + 1):
        while count[v] > 0:
            a[out] = v; out += 1; count[v] -= 1
    return a

if __name__ == "__main__":
    a = [4, 2, 2, 8, 3, 3, 1]
    counting_sort(a)
    print("sorted:", a)`,

    java: `public class Main {
    public static void countingSort(int[] a) {
        if (a.length == 0) return;
        int max = a[0];
        for (int x : a) if (x > max) max = x;
        int[] count = new int[max + 1];
        for (int x : a) count[x]++;
        int out = 0;
        for (int v = 0; v <= max; v++)
            while (count[v]-- > 0) a[out++] = v;
    }
    public static void main(String[] args) {
        int[] a = {4, 2, 2, 8, 3, 3, 1};
        countingSort(a);
        System.out.print("sorted:");
        for (int x : a) System.out.print(" " + x);
        System.out.println();
    }
}`,

    rust: `fn counting_sort(a: &mut Vec<u32>) {
    if a.is_empty() { return; }
    let k = *a.iter().max().unwrap() as usize;
    let mut count = vec![0usize; k + 1];
    for &x in a.iter() { count[x as usize] += 1; }
    let mut out = 0;
    for v in 0..=k {
        while count[v] > 0 {
            a[out] = v as u32;
            out += 1;
            count[v] -= 1;
        }
    }
}

fn main() {
    let mut a: Vec<u32> = vec![4, 2, 2, 8, 3, 3, 1];
    counting_sort(&mut a);
    println!("sorted: {:?}", a);
}`,
  },

  quick: {
    pseudo: `quick(a, lo, hi):
  if lo >= hi: return
  p = partition(a, lo, hi)     # Lomuto: last elem = pivot
  quick(a, lo, p - 1)
  quick(a, p + 1, hi)`,

    c: `#include <stdio.h>

int partition(int a[], int lo, int hi) {
    int p = a[hi], i = lo - 1;
    for (int j = lo; j < hi; j++) {
        if (a[j] < p) {
            i++;
            int t = a[i]; a[i] = a[j]; a[j] = t;
        }
    }
    int t = a[i + 1]; a[i + 1] = a[hi]; a[hi] = t;
    return i + 1;
}
void quicksort(int a[], int lo, int hi) {
    if (lo >= hi) return;
    int p = partition(a, lo, hi);
    quicksort(a, lo, p - 1);
    quicksort(a, p + 1, hi);
}

int main(void) {
    int a[] = {5, 2, 8, 1, 9, 3, 7, 4, 6};
    int n = 9;
    quicksort(a, 0, n - 1);
    printf("sorted:");
    for (int i = 0; i < n; i++) printf(" %d", a[i]);
    printf("\\n");
    return 0;
}`,

    cpp: `#include <iostream>
#include <vector>

int partition(std::vector<int>& a, int lo, int hi) {
    int p = a[hi], i = lo - 1;
    for (int j = lo; j < hi; ++j)
        if (a[j] < p) std::swap(a[++i], a[j]);
    std::swap(a[i + 1], a[hi]);
    return i + 1;
}
void quicksort(std::vector<int>& a, int lo, int hi) {
    if (lo >= hi) return;
    int p = partition(a, lo, hi);
    quicksort(a, lo, p - 1);
    quicksort(a, p + 1, hi);
}

int main() {
    std::vector<int> a = {5, 2, 8, 1, 9, 3, 7, 4, 6};
    quicksort(a, 0, (int)a.size() - 1);
    std::cout << "sorted:";
    for (int x : a) std::cout << " " << x;
    std::cout << "\\n";
    return 0;
}`,

    python: `def partition(a, lo, hi):
    p = a[hi]; i = lo - 1
    for j in range(lo, hi):
        if a[j] < p:
            i += 1
            a[i], a[j] = a[j], a[i]
    a[i+1], a[hi] = a[hi], a[i+1]
    return i + 1

def quicksort(a, lo=0, hi=None):
    if hi is None: hi = len(a) - 1
    if lo >= hi: return
    p = partition(a, lo, hi)
    quicksort(a, lo, p - 1)
    quicksort(a, p + 1, hi)

if __name__ == "__main__":
    a = [5, 2, 8, 1, 9, 3, 7, 4, 6]
    quicksort(a)
    print("sorted:", a)`,

    java: `public class Main {
    static int partition(int[] a, int lo, int hi) {
        int p = a[hi], i = lo - 1;
        for (int j = lo; j < hi; j++) {
            if (a[j] < p) {
                i++;
                int t = a[i]; a[i] = a[j]; a[j] = t;
            }
        }
        int t = a[i + 1]; a[i + 1] = a[hi]; a[hi] = t;
        return i + 1;
    }
    static void quicksort(int[] a, int lo, int hi) {
        if (lo >= hi) return;
        int p = partition(a, lo, hi);
        quicksort(a, lo, p - 1);
        quicksort(a, p + 1, hi);
    }
    public static void main(String[] args) {
        int[] a = {5, 2, 8, 1, 9, 3, 7, 4, 6};
        quicksort(a, 0, a.length - 1);
        System.out.print("sorted:");
        for (int x : a) System.out.print(" " + x);
        System.out.println();
    }
}`,

    rust: `fn partition(a: &mut [i32], lo: usize, hi: usize) -> usize {
    let p = a[hi];
    let mut i = lo;
    for j in lo..hi {
        if a[j] < p { a.swap(i, j); i += 1; }
    }
    a.swap(i, hi);
    i
}

fn quicksort(a: &mut [i32], lo: usize, hi: usize) {
    if lo >= hi || hi == usize::MAX { return; }
    let p = partition(a, lo, hi);
    if p > 0 { quicksort(a, lo, p - 1); }
    quicksort(a, p + 1, hi);
}

fn main() {
    let mut a = [5, 2, 8, 1, 9, 3, 7, 4, 6];
    let n = a.len();
    quicksort(&mut a, 0, n - 1);
    println!("sorted: {:?}", a);
}`,
  },

  merge: {
    pseudo: `merge_sort(a):
  if |a| <= 1: return a
  mid = |a| / 2
  L = merge_sort(a[0..mid])
  R = merge_sort(a[mid..])
  return merge(L, R)`,

    c: `#include <stdio.h>
#include <stdlib.h>
#include <string.h>

void merge(int a[], int lo, int mid, int hi) {
    int n = hi - lo + 1;
    int *tmp = malloc(n * sizeof(int));
    int i = lo, j = mid + 1, k = 0;
    while (i <= mid && j <= hi) tmp[k++] = (a[i] <= a[j]) ? a[i++] : a[j++];
    while (i <= mid) tmp[k++] = a[i++];
    while (j <= hi) tmp[k++] = a[j++];
    memcpy(a + lo, tmp, n * sizeof(int));
    free(tmp);
}
void merge_sort(int a[], int lo, int hi) {
    if (lo >= hi) return;
    int mid = lo + (hi - lo) / 2;
    merge_sort(a, lo, mid);
    merge_sort(a, mid + 1, hi);
    merge(a, lo, mid, hi);
}

int main(void) {
    int a[] = {5, 2, 8, 1, 9, 3, 7, 4, 6};
    int n = 9;
    merge_sort(a, 0, n - 1);
    printf("sorted:");
    for (int i = 0; i < n; i++) printf(" %d", a[i]);
    printf("\\n");
    return 0;
}`,

    cpp: `#include <iostream>
#include <vector>

void merge(std::vector<int>& a, int lo, int mid, int hi) {
    std::vector<int> tmp; tmp.reserve(hi - lo + 1);
    int i = lo, j = mid + 1;
    while (i <= mid && j <= hi) tmp.push_back(a[i] <= a[j] ? a[i++] : a[j++]);
    while (i <= mid) tmp.push_back(a[i++]);
    while (j <= hi) tmp.push_back(a[j++]);
    for (int k = 0; k < (int)tmp.size(); ++k) a[lo + k] = tmp[k];
}
void merge_sort(std::vector<int>& a, int lo, int hi) {
    if (lo >= hi) return;
    int mid = lo + (hi - lo) / 2;
    merge_sort(a, lo, mid);
    merge_sort(a, mid + 1, hi);
    merge(a, lo, mid, hi);
}

int main() {
    std::vector<int> a = {5, 2, 8, 1, 9, 3, 7, 4, 6};
    merge_sort(a, 0, (int)a.size() - 1);
    std::cout << "sorted:";
    for (int x : a) std::cout << " " << x;
    std::cout << "\\n";
    return 0;
}`,

    python: `def merge_sort(a):
    if len(a) <= 1: return a
    mid = len(a) // 2
    L, R = merge_sort(a[:mid]), merge_sort(a[mid:])
    out = []
    i = j = 0
    while i < len(L) and j < len(R):
        if L[i] <= R[j]: out.append(L[i]); i += 1
        else:             out.append(R[j]); j += 1
    out.extend(L[i:]); out.extend(R[j:])
    return out

if __name__ == "__main__":
    a = [5, 2, 8, 1, 9, 3, 7, 4, 6]
    print("sorted:", merge_sort(a))`,

    java: `public class Main {
    static void merge(int[] a, int lo, int mid, int hi) {
        int[] tmp = new int[hi - lo + 1];
        int i = lo, j = mid + 1, k = 0;
        while (i <= mid && j <= hi) tmp[k++] = a[i] <= a[j] ? a[i++] : a[j++];
        while (i <= mid) tmp[k++] = a[i++];
        while (j <= hi) tmp[k++] = a[j++];
        System.arraycopy(tmp, 0, a, lo, tmp.length);
    }
    static void mergeSort(int[] a, int lo, int hi) {
        if (lo >= hi) return;
        int mid = lo + (hi - lo) / 2;
        mergeSort(a, lo, mid);
        mergeSort(a, mid + 1, hi);
        merge(a, lo, mid, hi);
    }
    public static void main(String[] args) {
        int[] a = {5, 2, 8, 1, 9, 3, 7, 4, 6};
        mergeSort(a, 0, a.length - 1);
        System.out.print("sorted:");
        for (int x : a) System.out.print(" " + x);
        System.out.println();
    }
}`,

    rust: `fn merge_sort(a: &mut Vec<i32>) {
    let n = a.len();
    if n <= 1 { return; }
    let mid = n / 2;
    let mut l: Vec<i32> = a[..mid].to_vec();
    let mut r: Vec<i32> = a[mid..].to_vec();
    merge_sort(&mut l);
    merge_sort(&mut r);
    let (mut i, mut j, mut k) = (0, 0, 0);
    while i < l.len() && j < r.len() {
        if l[i] <= r[j] { a[k] = l[i]; i += 1; }
        else            { a[k] = r[j]; j += 1; }
        k += 1;
    }
    while i < l.len() { a[k] = l[i]; i += 1; k += 1; }
    while j < r.len() { a[k] = r[j]; j += 1; k += 1; }
}

fn main() {
    let mut a: Vec<i32> = vec![5, 2, 8, 1, 9, 3, 7, 4, 6];
    merge_sort(&mut a);
    println!("sorted: {:?}", a);
}`,
  },

  radix: {
    pseudo: `radix_sort(a):
  max_val = max(a)
  exp = 1
  while max_val / exp > 0:
    counting_sort_by_digit(a, exp)
    exp *= 10`,

    c: `#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void csort_digit(int a[], int n, int exp) {
    int *out = malloc(n * sizeof(int));
    int cnt[10] = {0};
    for (int i = 0; i < n; i++) cnt[(a[i] / exp) % 10]++;
    for (int i = 1; i < 10; i++) cnt[i] += cnt[i - 1];
    for (int i = n - 1; i >= 0; i--) out[--cnt[(a[i] / exp) % 10]] = a[i];
    memcpy(a, out, n * sizeof(int));
    free(out);
}

void radix_sort(int a[], int n) {
    if (n <= 0) return;
    int max = a[0];
    for (int i = 1; i < n; i++) if (a[i] > max) max = a[i];
    for (int exp = 1; max / exp > 0; exp *= 10) csort_digit(a, n, exp);
}

int main(void) {
    int a[] = {170, 45, 75, 90, 802, 24, 2, 66};
    int n = 8;
    radix_sort(a, n);
    printf("sorted:");
    for (int i = 0; i < n; i++) printf(" %d", a[i]);
    printf("\\n");
    return 0;
}`,

    cpp: `#include <iostream>
#include <vector>
#include <algorithm>

void csort_digit(std::vector<int>& a, int exp) {
    int n = (int)a.size();
    std::vector<int> out(n);
    int cnt[10] = {0};
    for (int x : a) cnt[(x / exp) % 10]++;
    for (int i = 1; i < 10; i++) cnt[i] += cnt[i - 1];
    for (int i = n - 1; i >= 0; i--) out[--cnt[(a[i] / exp) % 10]] = a[i];
    a = out;
}
void radix_sort(std::vector<int>& a) {
    if (a.empty()) return;
    int mx = *std::max_element(a.begin(), a.end());
    for (int exp = 1; mx / exp > 0; exp *= 10) csort_digit(a, exp);
}

int main() {
    std::vector<int> a = {170, 45, 75, 90, 802, 24, 2, 66};
    radix_sort(a);
    std::cout << "sorted:";
    for (int x : a) std::cout << " " << x;
    std::cout << "\\n";
    return 0;
}`,

    python: `def counting_by_digit(a, exp):
    n = len(a)
    out = [0] * n
    count = [0] * 10
    for x in a: count[(x // exp) % 10] += 1
    for i in range(1, 10): count[i] += count[i - 1]
    for i in range(n - 1, -1, -1):
        d = (a[i] // exp) % 10
        count[d] -= 1
        out[count[d]] = a[i]
    a[:] = out

def radix_sort(a):
    if not a: return a
    mx = max(a); exp = 1
    while mx // exp > 0:
        counting_by_digit(a, exp)
        exp *= 10
    return a

if __name__ == "__main__":
    a = [170, 45, 75, 90, 802, 24, 2, 66]
    radix_sort(a)
    print("sorted:", a)`,

    java: `public class Main {
    static void csortDigit(int[] a, int exp) {
        int n = a.length;
        int[] out = new int[n];
        int[] count = new int[10];
        for (int x : a) count[(x / exp) % 10]++;
        for (int i = 1; i < 10; i++) count[i] += count[i - 1];
        for (int i = n - 1; i >= 0; i--) out[--count[(a[i] / exp) % 10]] = a[i];
        System.arraycopy(out, 0, a, 0, n);
    }
    public static void radixSort(int[] a) {
        if (a.length == 0) return;
        int max = a[0];
        for (int x : a) if (x > max) max = x;
        for (int exp = 1; max / exp > 0; exp *= 10) csortDigit(a, exp);
    }
    public static void main(String[] args) {
        int[] a = {170, 45, 75, 90, 802, 24, 2, 66};
        radixSort(a);
        System.out.print("sorted:");
        for (int x : a) System.out.print(" " + x);
        System.out.println();
    }
}`,

    rust: `fn csort_digit(a: &mut Vec<u32>, exp: u32) {
    let n = a.len();
    let mut out = vec![0u32; n];
    let mut count = [0usize; 10];
    for &x in a.iter() { count[((x / exp) % 10) as usize] += 1; }
    for i in 1..10 { count[i] += count[i - 1]; }
    for i in (0..n).rev() {
        let d = ((a[i] / exp) % 10) as usize;
        count[d] -= 1;
        out[count[d]] = a[i];
    }
    *a = out;
}

fn radix_sort(a: &mut Vec<u32>) {
    if a.is_empty() { return; }
    let mx = *a.iter().max().unwrap();
    let mut exp = 1u32;
    while mx / exp > 0 {
        csort_digit(a, exp);
        if let Some(next) = exp.checked_mul(10) { exp = next; } else { break; }
    }
}

fn main() {
    let mut a: Vec<u32> = vec![170, 45, 75, 90, 802, 24, 2, 66];
    radix_sort(&mut a);
    println!("sorted: {:?}", a);
}`,
  },
}

export const SORTING_BUBBLE_SAMPLES = [
  { name: 'Random 9',    description: 'Shuffled 1..9 — worst case for bubble',   stdin: '', expected: '' },
  { name: 'Sorted',      description: 'Already sorted — best case, early exit',  stdin: '', expected: '' },
]
export const SORTING_COUNTING_SAMPLES = [
  { name: 'Small keys',   description: 'Small non-negative integers',            stdin: '', expected: '' },
  { name: 'Duplicates',   description: 'Many repeated values',                   stdin: '', expected: '' },
]
export const SORTING_QUICK_SAMPLES = [
  { name: 'Random 9',    description: 'Balanced case — expected O(n log n)',    stdin: '', expected: '' },
  { name: 'Adversarial', description: 'Already sorted — worst case with Lomuto', stdin: '', expected: '' },
]
export const SORTING_MERGE_SAMPLES = [
  { name: 'Random 9',    description: 'Balanced merge — O(n log n)',            stdin: '', expected: '' },
  { name: 'Two runs',    description: 'Already sorted arrays merged',           stdin: '', expected: '' },
]
export const SORTING_RADIX_SAMPLES = [
  { name: '3-digit ints', description: 'Mix of 1/2/3-digit non-negatives',      stdin: '', expected: '' },
  { name: 'All same',     description: 'Every element identical',               stdin: '', expected: '' },
]
