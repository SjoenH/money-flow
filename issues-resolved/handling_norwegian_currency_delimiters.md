### Update on Handling Norwegian Currency Delimiters in Receipt OCR

There has been an important update regarding the handling of Norwegian currency in the Receipt OCR process. It has been observed that some receipts use a period (.) as a delimiter instead of a comma (,). This means that amounts may appear in the format: `123.45` instead of the expected `123,45`.

#### Scenarios to Consider:
1. **Comma as Delimiter**: Traditional format where currency is separated by a comma (e.g., `123,45`).
2. **Period as Delimiter**: Some receipts may present amounts using a period (e.g., `123.45`).

#### Recommended Approach:
- Ensure that the OCR tool is capable of recognizing both formats and can correctly interpret them as valid Norwegian currency. 
- Implement logic to convert period delimiters to comma delimiters where applicable, or vice versa, depending on the expected output format.

This update is crucial for enhancing the accuracy of receipt processing and ensuring that all formats of Norwegian currency are handled properly.