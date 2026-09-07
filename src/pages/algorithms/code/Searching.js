// Searching — linear + binary in 6 languages.

export const CODE = {
  linear: {
    pseudo: `for i = 0 .. n-1:
  if a[i] == target:
    return i
return -1`,

    c: `int linear_search(const int a[], int n, int target) {
    for (int i = 0; i < n; i++) {
        if (a[i] == target) return i;
    }
    return -1;
}`,

    cpp: `#include <vector>

int linear_search(const std::vector<int>& a, int target) {
    for (int i = 0; i < (int)a.size(); ++i) {
        if (a[i] == target) return i;
    }
    return -1;
}`,

    python: `def linear_search(a, target):
    # Straightforward scan — works even on unsorted input.
    for i, x in enumerate(a):
        if x == target:
            return i
    return -1`,

    java: `public static int linearSearch(int[] a, int target) {
    for (int i = 0; i < a.length; i++) {
        if (a[i] == target) return i;
    }
    return -1;
}`,

    rust: `pub fn linear_search(a: &[i32], target: i32) -> Option<usize> {
    // Works on any slice — no ordering required.
    a.iter().position(|&x| x == target)
}`,
  },

  binary: {
    pseudo: `lo = 0
hi = n - 1
while lo <= hi:
  mid = lo + (hi - lo) / 2
  if a[mid] == target: return mid
  if a[mid] < target:
    lo = mid + 1
  else:
    hi = mid - 1
return -1`,

    c: `int binary_search(const int a[], int n, int target) {
    int lo = 0, hi = n - 1;
    while (lo <= hi) {
        /* lo + (hi - lo) / 2 avoids int overflow that (lo + hi) / 2 hits. */
        int mid = lo + (hi - lo) / 2;
        if (a[mid] == target) return mid;
        if (a[mid] < target) lo = mid + 1;
        else                  hi = mid - 1;
    }
    return -1;
}`,

    cpp: `#include <vector>

int binary_search_idx(const std::vector<int>& a, int target) {
    int lo = 0, hi = (int)a.size() - 1;
    while (lo <= hi) {
        int mid = lo + (hi - lo) / 2;
        if (a[mid] == target) return mid;
        if (a[mid] < target) lo = mid + 1;
        else                  hi = mid - 1;
    }
    return -1;
}`,

    python: `def binary_search(a, target):
    lo, hi = 0, len(a) - 1
    while lo <= hi:
        # // is floor division; both bounds are inclusive.
        mid = (lo + hi) // 2
        if a[mid] == target:
            return mid
        if a[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1`,

    java: `public static int binarySearch(int[] a, int target) {
    int lo = 0, hi = a.length - 1;
    while (lo <= hi) {
        int mid = lo + (hi - lo) / 2; // overflow-safe midpoint
        if (a[mid] == target) return mid;
        if (a[mid] < target) lo = mid + 1;
        else                  hi = mid - 1;
    }
    return -1;
}`,

    rust: `pub fn binary_search(a: &[i32], target: i32) -> Option<usize> {
    let (mut lo, mut hi) = (0i64, a.len() as i64 - 1);
    while lo <= hi {
        // usize math — mid stays inside the slice bounds.
        let mid = lo + (hi - lo) / 2;
        let v = a[mid as usize];
        if v == target { return Some(mid as usize); }
        if v < target { lo = mid + 1; } else { hi = mid - 1; }
    }
    None
}`,
  },
}
