### Description
The current Receipt OCR functionality needs to correctly handle the Norwegian currency delimiter. Unlike some other formats, Norwegian currency uses a comma (,) as the decimal separator and a period (.) as the thousands separator. This issue aims to ensure the OCR recognizes and processes amounts accurately based on this format.

### Tasks
- Update OCR parsing logic to correctly interpret Norwegian currency delimiters.
- Add test cases for amounts with various formats (e.g., 1.234,56).
- Verify compatibility with existing currency formats.

### Acceptance Criteria
- OCR successfully extracts and interprets amounts with Norwegian delimiters.
- No regressions in handling other currency formats.

### Additional Notes
This issue is particularly relevant for users submitting receipts in Norway. Addressing this will improve accuracy and usability for that user base.