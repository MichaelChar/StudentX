# API Contracts — Student Housing Directory

## Base URL

All endpoints are relative to the application root (e.g. `http://localhost:3000`).

---

## GET /api/listings

Returns a filtered, sorted list of student housing listings. Queries the `listings` fact table joined with `rent`, `location`, `property_types`, `landlords`, `listing_amenities` → `amenities`, and `faculty_distances` → `faculties`.

### Query Parameters

| Parameter          | Type   | Required | Description |
|--------------------|--------|----------|-------------|
| `faculty`          | string | No       | Faculty ID (e.g. `auth-main`, `uom-main`). Filters `faculty_distances` to only the matching faculty. Required for `sort_by=walk_minutes` or `sort_by=transit_minutes`. |
| `max_budget`       | number | No       | Maximum monthly price in EUR. Only listings at or below this price are returned. Must be a positive number. |
| `types`            | string | No       | Comma-separated property type names (e.g. `Studio,Room in shared apartment`). Must match `property_types.name` exactly. |
| `duration`         | string | No       | Rental duration filter. Reserved for future use. |
| `exclude_amenities`| string | No       | Comma-separated amenity names (e.g. `AC,Elevator`). Excludes listings that are **missing** any of these amenities — i.e. only listings with ALL specified amenities pass the filter. |
| `sort_by`          | string | No       | Sort field: `price` (default), `walk_minutes`, `transit_minutes`. |
| `sort_order`       | string | No       | `asc` (default) or `desc`. |

### Response — 200 OK

```json
{
  "listings": [
    {
      "listing_id": "0001-01",
      "address": "Tsimiski 45",
      "neighborhood": "Kentro",
      "monthly_price": 350,
      "currency": "EUR",
      "bills_included": true,
      "deposit": 350,
      "property_type": "Studio",
      "amenities": ["AC", "Furnished", "Elevator", "Balcony"],
      "description": "Bright studio apartment...",
      "photos": ["/photos/0001-01_1.jpg"],
      "landlord": {
        "name": "Dimitris Papadopoulos",
        "contact_info": "d.papadopoulos@email.gr"
      },
      "faculty_distances": [
        {
          "faculty_id": "auth-main",
          "faculty_name": "AUTH Main Campus",
          "university": "AUTH",
          "walk_minutes": 25,
          "transit_minutes": 12
        }
      ]
    }
  ]
}
```

When `faculty` is provided, `faculty_distances` contains only the matching faculty entry. When omitted, all faculty distances are included.

### Errors

| Status | Condition | Example |
|--------|-----------|---------|
| 400    | Invalid `max_budget` | `{ "error": "max_budget must be a positive number" }` |
| 400    | Invalid `sort_by` | `{ "error": "sort_by must be one of: price, walk_minutes, transit_minutes" }` |
| 400    | Invalid `sort_order` | `{ "error": "sort_order must be 'asc' or 'desc'" }` |
| 500    | Database error | `{ "error": "Failed to fetch listings" }` |

---

## GET /api/listings/[id]

Returns full detail for a single listing with all dimensions, all amenity names, all faculty distances, and landlord info.

### Path Parameters

| Parameter | Type   | Description |
|-----------|--------|-------------|
| `id`      | string | Listing ID (e.g. `0001001`). Must start with a digit and contain only digits and optional dashes. |

### Response — 200 OK

```json
{
  "listing": {
    "listing_id": "0001-01",
    "address": "Tsimiski 45",
    "neighborhood": "Kentro",
    "monthly_price": 350,
    "currency": "EUR",
    "bills_included": true,
    "deposit": 350,
    "property_type": "Studio",
    "amenities": ["AC", "Furnished", "Elevator", "Balcony"],
    "description": "Bright studio apartment in the heart of Thessaloniki...",
    "photos": ["/photos/0001-01_1.jpg", "/photos/0001-01_2.jpg"],
    "landlord": {
      "name": "Dimitris Papadopoulos",
      "contact_info": "d.papadopoulos@email.gr"
    },
    "faculty_distances": [
      {
        "faculty_id": "auth-main",
        "faculty_name": "AUTH Main Campus",
        "university": "AUTH",
        "walk_minutes": 25,
        "transit_minutes": 12
      },
      {
        "faculty_id": "auth-medical",
        "faculty_name": "AUTH Medical School",
        "university": "AUTH",
        "walk_minutes": 20,
        "transit_minutes": 10
      },
      {
        "faculty_id": "uom-main",
        "faculty_name": "UoM Main Campus",
        "university": "UoM",
        "walk_minutes": 18,
        "transit_minutes": 8
      },
      {
        "faculty_id": "ihu-thermi",
        "faculty_name": "IHU Thermi Campus",
        "university": "IHU",
        "walk_minutes": 45,
        "transit_minutes": 22
      }
    ]
  }
}
```

All faculty distances are always included in the detail view.

### Errors

| Status | Condition | Example |
|--------|-----------|---------|
| 400    | Invalid ID format | `{ "error": "Invalid listing ID format" }` |
| 404    | Listing not found | `{ "error": "Listing not found" }` |
| 500    | Database error | `{ "error": "Failed to fetch listing" }` |

---

## GET /api/faculties

Returns all university faculty reference points for the quiz dropdown. Ordered by university then name.

### Response — 200 OK

```json
{
  "faculties": [
    {
      "id": "auth-main",
      "name": "AUTH Main Campus",
      "university": "AUTH"
    },
    {
      "id": "auth-medical",
      "name": "AUTH Medical School",
      "university": "AUTH"
    },
    {
      "id": "auth-agriculture",
      "name": "AUTH School of Agriculture",
      "university": "AUTH"
    },
    {
      "id": "ihu-sindos",
      "name": "IHU Sindos Campus",
      "university": "IHU"
    },
    {
      "id": "ihu-thermi",
      "name": "IHU Thermi Campus",
      "university": "IHU"
    },
    {
      "id": "uom-main",
      "name": "UoM Main Campus",
      "university": "UoM"
    }
  ]
}
```

### Errors

| Status | Condition | Example |
|--------|-----------|---------|
| 500    | Database error | `{ "error": "Failed to fetch faculties" }` |

---

## Common Error Shape

All error responses follow this structure:

```json
{
  "error": "Human-readable error message"
}
```

Internal error details (stack traces, SQL errors) are never exposed to the client. They are logged server-side only.

---

## Data Source

All endpoints query Supabase (PostgreSQL) using the star schema defined in `docs/schema.md`. The `listings` fact table is joined with dimension tables (`rent`, `location`, `property_types`, `landlords`) and bridge tables (`listing_amenities` → `amenities`, `faculty_distances` → `faculties`).

Response objects are flattened from the normalized schema into the shapes above by `src/lib/transformListing.js`.
