# C# Testing with xUnit

## Framework Options

| Framework | Command |
|-----------|---------|
| xUnit | `dotnet test` |
| NUnit | `dotnet test` |
| MSTest | `dotnet test` |

---

## xUnit Patterns (RECOMMENDED)

```csharp
public class UserServiceTests
{
    private readonly Mock<IUserRepository> _mockRepo = new();
    private readonly UserService _sut;

    public UserServiceTests()
    {
        _sut = new UserService(_mockRepo.Object);
    }

    [Fact]
    public async Task GetByIdAsync_WhenUserExists_ReturnsUser()
    {
        // Arrange
        var expected = new User { Id = 1, Name = "Test" };
        _mockRepo.Setup(r => r.FindAsync(1, default))
            .ReturnsAsync(expected);

        // Act
        var result = await _sut.GetByIdAsync(1);

        // Assert
        Assert.Equal(expected, result);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public async Task GetByIdAsync_WhenIdInvalid_ThrowsArgumentException(int id)
    {
        await Assert.ThrowsAsync<ArgumentException>(() => _sut.GetByIdAsync(id));
    }
}
```

---

## Rules

- MUST follow Arrange-Act-Assert pattern
- MUST use meaningful test names: `MethodName_WhenCondition_ExpectedBehavior`
- SHOULD use `[Theory]` for parameterized tests
- MUST mock external dependencies
- SHOULD use `_sut` (System Under Test) for the class being tested

---

## Test Naming Convention

```
MethodName_WhenCondition_ExpectedBehavior
```

Examples:
- `GetByIdAsync_WhenUserExists_ReturnsUser`
- `CreateUser_WhenEmailInvalid_ThrowsValidationException`
- `Delete_WhenNotFound_ReturnsNotFound`

---

## Mocking with Moq

```csharp
// Setup
var mockRepo = new Mock<IUserRepository>();
mockRepo.Setup(r => r.FindAsync(It.IsAny<int>(), default))
    .ReturnsAsync(new User { Id = 1, Name = "Test" });

// Verify
mockRepo.Verify(r => r.SaveAsync(It.IsAny<User>(), default), Times.Once);
```

---

## Integration Testing

```csharp
public class UserApiTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client;

    public UserApiTests(WebApplicationFactory<Program> factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task GetUser_ReturnsOk()
    {
        var response = await _client.GetAsync("/api/users/1");
        response.EnsureSuccessStatusCode();
    }
}
```

---

## Test Coverage

SHOULD aim for >80% coverage on business logic:

```bash
dotnet test --collect:"XPlat Code Coverage"
dotnet tool run reportgenerator -reports:coverage.cobertura.xml -targetdir:coverage
```
