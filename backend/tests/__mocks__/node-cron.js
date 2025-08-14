module.exports = {
	schedule: jest.fn().mockReturnValue({
		start: jest.fn(),
		stop: jest.fn(),
	}),
};