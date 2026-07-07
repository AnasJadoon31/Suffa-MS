from datetime import date

from hijri_converter import Gregorian


def to_hijri_string(gregorian_date: date) -> str:
    hijri = Gregorian(gregorian_date.year, gregorian_date.month, gregorian_date.day).to_hijri()
    return f"{hijri.day} {hijri.month_name('en')} {hijri.year} AH"
