from typing import TypedDict, NotRequired
from decimal import Decimal


class ParsedListing(TypedDict):
    portal: str
    external_id: str
    url: str
    title: NotRequired[str | None]
    description: NotRequired[str | None]
    price: NotRequired[Decimal | None]
    area_sqm_gross: NotRequired[Decimal | None]
    typology: NotRequired[int | None]
    raw_location_text: NotRequired[str | None]
    image_urls: NotRequired[list[str]]
